#!/bin/bash

#===============================================================================
# Server Bootstrap Script
#===============================================================================
# Sets up a fresh Ubuntu server with Docker, security hardening, and prepares
# for running the Caddy static web server.
#
# Usage:
#   bash bootstrap.sh
#
# Requirements:
#   - Ubuntu 22.04 or 24.04 LTS
#   - Root access
#   - SSH key already added to server
#===============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

#-------------------------------------------------------------------------------
# Pre-flight Checks
#-------------------------------------------------------------------------------

if [[ $EUID -ne 0 ]]; then
	log_error "This script must be run as root"
	exit 1
fi

if ! grep -q "Ubuntu" /etc/os-release 2>/dev/null; then
	log_error "This script is designed for Ubuntu only"
	exit 1
fi

log_info "Starting server bootstrap..."

#-------------------------------------------------------------------------------
# Configuration Prompts
#-------------------------------------------------------------------------------

read -p "Enter your domain name (e.g., example.com): " DOMAIN
read -p "Enter your email for Let's Encrypt: " EMAIL

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
	log_error "Domain and email are required"
	exit 1
fi

log_info "Configuring for domain: $DOMAIN"

#-------------------------------------------------------------------------------
# System Updates
#-------------------------------------------------------------------------------

log_info "Updating system packages..."
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
DEBIAN_FRONTEND=noninteractive apt-get dist-upgrade -y

#-------------------------------------------------------------------------------
# Install Essential Packages
#-------------------------------------------------------------------------------

log_info "Installing essential packages..."
DEBIAN_FRONTEND=noninteractive apt-get install -y \
	apt-transport-https \
	ca-certificates \
	curl \
	gnupg \
	lsb-release \
	ufw \
	fail2ban \
	unattended-upgrades \
	apt-listchanges

#-------------------------------------------------------------------------------
# Install Docker
#-------------------------------------------------------------------------------

log_info "Installing Docker..."

if command -v docker &> /dev/null; then
	log_info "Docker is already installed"
else
	curl -fsSL https://get.docker.com | sh
	systemctl enable docker
	systemctl start docker
fi

# Install Docker Compose plugin
DEBIAN_FRONTEND=noninteractive apt-get install -y docker-compose-plugin

log_success "Docker installed: $(docker --version)"

#-------------------------------------------------------------------------------
# Configure Firewall (UFW)
#-------------------------------------------------------------------------------

log_info "Configuring firewall..."

ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# Allow SSH
ufw allow 22/tcp comment 'SSH'

# Allow HTTP/HTTPS for Caddy
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw allow 443/udp comment 'HTTP/3'

# Enable firewall
ufw --force enable

log_success "Firewall configured"
ufw status

#-------------------------------------------------------------------------------
# Configure Fail2ban
#-------------------------------------------------------------------------------

log_info "Configuring Fail2ban..."

cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
ignoreip = 127.0.0.1/8 ::1

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 86400
EOF

systemctl enable fail2ban
systemctl restart fail2ban

log_success "Fail2ban configured"

#-------------------------------------------------------------------------------
# Configure SSH Hardening
#-------------------------------------------------------------------------------

log_info "Hardening SSH configuration..."

# Backup original config
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup

# Create hardened SSH config
cat > /etc/ssh/sshd_config.d/99-hardened.conf << 'EOF'
# SSH Hardening Configuration

# Disable password authentication (use SSH keys only)
PasswordAuthentication no
PermitEmptyPasswords no

# Disable root login
PermitRootLogin no

# Enable public key authentication
PubkeyAuthentication yes

# Disable X11 forwarding
X11Forwarding no

# Disable TCP forwarding (uncomment if not needed)
# AllowTcpForwarding no

# Max authentication attempts
MaxAuthTries 3

# Connection timeout
LoginGraceTime 30

# Idle timeout (5 minutes)
ClientAliveInterval 300
ClientAliveCountMax 2

# Use strong ciphers
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com
MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com
KexAlgorithms curve25519-sha256@libssh.org,curve25519-sha256,diffie-hellman-group16-sha512,diffie-hellman-group18-sha512
EOF

# Create privilege separation directory if missing
mkdir -p /run/sshd

# Validate SSH config
if sshd -t; then
	systemctl restart ssh
	log_success "SSH hardened successfully"
else
	log_error "SSH configuration error, reverting..."
	rm /etc/ssh/sshd_config.d/99-hardened.conf
	exit 1
fi

#-------------------------------------------------------------------------------
# Configure Automatic Updates
#-------------------------------------------------------------------------------

log_info "Configuring automatic security updates..."

cat > /etc/apt/apt.conf.d/20auto-upgrades << 'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

cat > /etc/apt/apt.conf.d/50unattended-upgrades << 'EOF'
Unattended-Upgrade::Allowed-Origins {
	"${distro_id}:${distro_codename}";
	"${distro_id}:${distro_codename}-security";
	"${distro_id}ESMApps:${distro_codename}-apps-security";
	"${distro_id}ESM:${distro_codename}-infra-security";
};

Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
EOF

systemctl enable unattended-upgrades
log_success "Automatic updates configured"

#-------------------------------------------------------------------------------
# Create Deploy User (optional)
#-------------------------------------------------------------------------------

DEPLOY_USER="deploy"

if ! id "$DEPLOY_USER" &>/dev/null; then
	log_info "Creating deploy user..."
	adduser --disabled-password --gecos "" "$DEPLOY_USER"
	usermod -aG docker "$DEPLOY_USER"
	usermod -aG sudo "$DEPLOY_USER"

	# Copy SSH keys from root
	mkdir -p /home/$DEPLOY_USER/.ssh
	if [[ -f /root/.ssh/authorized_keys ]]; then
		cp /root/.ssh/authorized_keys /home/$DEPLOY_USER/.ssh/
		chown -R $DEPLOY_USER:$DEPLOY_USER /home/$DEPLOY_USER/.ssh
		chmod 700 /home/$DEPLOY_USER/.ssh
		chmod 600 /home/$DEPLOY_USER/.ssh/authorized_keys
	fi

	log_success "Deploy user created"
else
	log_info "Deploy user already exists"
	# Ensure user is in docker group
	usermod -aG docker "$DEPLOY_USER"
fi

#-------------------------------------------------------------------------------
# Create Directories
#-------------------------------------------------------------------------------

log_info "Creating directories..."

mkdir -p /opt/config
mkdir -p /opt/content
chown -R $DEPLOY_USER:$DEPLOY_USER /opt/config
chown -R $DEPLOY_USER:$DEPLOY_USER /opt/content

log_success "Directories created"

#-------------------------------------------------------------------------------
# Create .env File
#-------------------------------------------------------------------------------

log_info "Creating .env file..."

cat > /opt/config/.env << EOF
DOMAIN=$DOMAIN
EMAIL=$EMAIL
EOF

chown $DEPLOY_USER:$DEPLOY_USER /opt/config/.env
log_success ".env file created"

#-------------------------------------------------------------------------------
# Cleanup
#-------------------------------------------------------------------------------

log_info "Cleaning up..."
apt-get autoremove -y
apt-get autoclean -y

#-------------------------------------------------------------------------------
# Summary
#-------------------------------------------------------------------------------

echo ""
log_success "=========================================="
log_success "Server Bootstrap Complete!"
log_success "=========================================="
echo ""
log_info "What was configured:"
echo "  ✓ System packages updated"
echo "  ✓ Docker and Docker Compose installed"
echo "  ✓ Firewall (UFW) configured - ports 22, 80, 443 open"
echo "  ✓ Fail2ban configured for SSH protection"
echo "  ✓ SSH hardened (key-only auth, no root login)"
echo "  ✓ Automatic security updates enabled"
echo "  ✓ Deploy user '$DEPLOY_USER' created"
echo "  ✓ Directories created at /opt/config and /opt/content"
echo ""
log_warning "IMPORTANT: Before logging out, verify SSH access works!"
echo ""
echo "  1. Open a new terminal and test:"
echo "     ssh $DEPLOY_USER@$(hostname -I | awk '{print $1}')"
echo ""
echo "  2. Start the web server:"
echo "     su - deploy"
echo "     cd /opt/config && docker compose up -d"
echo ""
log_info "Root login and password auth are now disabled."
echo ""
