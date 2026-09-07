#!/usr/bin/env bash
set -euo pipefail

# Cloud Agent install step for the bobterhune3 GitHub profile README repository.
#
# This repository has no build system or application code — it is a GitHub
# profile README plus a profile image. The "development experience" is editing
# README.md and previewing how GitHub will render it.
#
# This script installs, without sudo:
#   - grip: renders README.md exactly like GitHub (via the GitHub Markdown API)
#           and serves a live local preview.
#   - markdownlint-cli2: lints Markdown so broken syntax is caught before push.
#
# It is idempotent: re-running reinstalls the pinned versions in place.

# markdownlint-cli2 into a user-owned npm prefix (no root required).
NPM_PREFIX="$HOME/.npm-global"
mkdir -p "$NPM_PREFIX"
npm install -g --prefix "$NPM_PREFIX" markdownlint-cli2@0.23.2

# grip into the user site (~/.local/bin/grip). pip is not externally managed on
# this base image, so a --user install needs neither a venv nor system packages.
python3 -m pip install --user --upgrade "grip==4.6.2"

echo "Installed tools:"
"$NPM_PREFIX/bin/markdownlint-cli2" --version 2>/dev/null | head -1 || true
"$HOME/.local/bin/grip" --version || true
