#!/usr/bin/env sh

TARGET="src/episodes/$1"

mkdir "${TARGET}"
cp EPISODE.md "${TARGET}"
mv "${TARGET}/EPISODE.md" "${TARGET}/index.md"
