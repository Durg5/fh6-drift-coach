#!/usr/bin/env bash
# prepare-sidecar.sh
#
# Downloads a portable Node.js binary for the HOST platform and places it
# in src-tauri/binaries/ with the name Tauri's externalBin expects.
#
# Tauri naming convention: `<basename>-<rust-target-triple>[ext]`
#   e.g. node-sidecar-x86_64-pc-windows-msvc.exe
#        node-sidecar-aarch64-apple-darwin
#        node-sidecar-x86_64-unknown-linux-gnu

set -e

NODE_VERSION="${NODE_SIDECAR_VERSION:-v22.11.0}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN_DIR="$ROOT/src-tauri/binaries"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

cyan()   { printf '\033[36m%s\033[0m\n' "$*"; }
green()  { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
red()    { printf '\033[31m%s\033[0m\n' "$*"; }

cyan "Detecting host platform"

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux)
    case "$ARCH" in
      x86_64|amd64) TARGET="x86_64-unknown-linux-gnu"; NODE_DIST="node-${NODE_VERSION}-linux-x64.tar.xz" ;;
      aarch64|arm64) TARGET="aarch64-unknown-linux-gnu"; NODE_DIST="node-${NODE_VERSION}-linux-arm64.tar.xz" ;;
      *) red "Unsupported Linux arch: $ARCH"; exit 1 ;;
    esac
    EXT=""
    EXTRACT="tar -xJf"
    NODE_BIN_REL="bin/node"
    ;;
  Darwin)
    case "$ARCH" in
      x86_64) TARGET="x86_64-apple-darwin"; NODE_DIST="node-${NODE_VERSION}-darwin-x64.tar.gz" ;;
      arm64)  TARGET="aarch64-apple-darwin"; NODE_DIST="node-${NODE_VERSION}-darwin-arm64.tar.gz" ;;
      *) red "Unsupported macOS arch: $ARCH"; exit 1 ;;
    esac
    EXT=""
    EXTRACT="tar -xzf"
    NODE_BIN_REL="bin/node"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    TARGET="x86_64-pc-windows-msvc"
    NODE_DIST="node-${NODE_VERSION}-win-x64.zip"
    EXT=".exe"
    EXTRACT="unzip -q"
    NODE_BIN_REL="node.exe"
    ;;
  *)
    red "Unsupported OS: $OS"; exit 1 ;;
esac

URL="https://nodejs.org/dist/${NODE_VERSION}/${NODE_DIST}"
DEST="$BIN_DIR/node-sidecar-${TARGET}${EXT}"

mkdir -p "$BIN_DIR"

if [ -f "$DEST" ]; then
  green "  Sidecar already present: $DEST"
  green "  (delete it to force a re-download)"
  exit 0
fi

cyan "Downloading Node $NODE_VERSION for $TARGET"
yellow "  $URL"
if command -v curl >/dev/null 2>&1; then
  curl -fL --progress-bar -o "$TMP_DIR/node.archive" "$URL"
elif command -v wget >/dev/null 2>&1; then
  wget -q --show-progress -O "$TMP_DIR/node.archive" "$URL"
else
  red "Need curl or wget to download Node"
  exit 1
fi

cyan "Extracting"
cd "$TMP_DIR"
$EXTRACT node.archive
EXTRACTED_DIR="$(find . -maxdepth 1 -type d -name 'node-*' | head -1)"
if [ -z "$EXTRACTED_DIR" ]; then
  red "Failed to find extracted Node directory"
  exit 1
fi

cp "$EXTRACTED_DIR/$NODE_BIN_REL" "$DEST"
chmod +x "$DEST"

green "✓ Sidecar ready: $DEST"
