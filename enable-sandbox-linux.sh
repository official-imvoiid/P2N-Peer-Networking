#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════
# P2N — Enable Linux Sandbox (firejail + bubblewrap)
# Auto-detects package manager and installs sandbox dependencies
# Supports: apt, dnf, pacman, zypper, apk, emerge
# ════════════════════════════════════════════════════════════════════════

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  P2N — Linux Sandbox Setup${NC}"
echo -e "${BLUE}  Installs firejail and bubblewrap for OS-level sandboxing${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

# ── Check root ────────────────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
    echo -e "${YELLOW}[INFO]${NC} This script needs root privileges to install packages."
    echo -e "${YELLOW}[INFO]${NC} Re-running with sudo..."
    echo ""
    exec sudo "$0" "$@"
fi

# ── Detect package manager ────────────────────────────────────────────────
install_packages() {
    if command -v apt-get &>/dev/null; then
        echo -e "${BLUE}[*]${NC} Detected: apt (Debian/Ubuntu)"
        apt-get update -qq
        apt-get install -y firejail bubblewrap
    elif command -v dnf &>/dev/null; then
        echo -e "${BLUE}[*]${NC} Detected: dnf (Fedora/RHEL)"
        dnf install -y firejail bubblewrap
    elif command -v pacman &>/dev/null; then
        echo -e "${BLUE}[*]${NC} Detected: pacman (Arch/Manjaro)"
        pacman -Sy --noconfirm firejail bubblewrap
    elif command -v zypper &>/dev/null; then
        echo -e "${BLUE}[*]${NC} Detected: zypper (openSUSE)"
        zypper install -y firejail bubblewrap
    elif command -v apk &>/dev/null; then
        echo -e "${BLUE}[*]${NC} Detected: apk (Alpine)"
        apk add firejail bubblewrap
    elif command -v emerge &>/dev/null; then
        echo -e "${BLUE}[*]${NC} Detected: emerge (Gentoo)"
        emerge --ask=n sys-apps/firejail sys-apps/bubblewrap
    else
        echo -e "${RED}[ERROR]${NC} No supported package manager found."
        echo ""
        echo "  Supported: apt, dnf, pacman, zypper, apk, emerge"
        echo ""
        echo "  Manual install:"
        echo "    firejail : https://firejail.wordpress.com/"
        echo "    bubblewrap: https://github.com/containers/bubblewrap"
        echo ""
        exit 1
    fi
}

# ── Check if already installed ─────────────────────────────────────────────
echo -e "${BLUE}[*]${NC} Checking existing installations..."
echo ""

FIREJAIL_OK=false
BWRAP_OK=false

if command -v firejail &>/dev/null; then
    FJ_VER=$(firejail --version 2>/dev/null | head -1)
    echo -e "  ${GREEN}✓${NC} firejail: ${FJ_VER}"
    FIREJAIL_OK=true
else
    echo -e "  ${YELLOW}✗${NC} firejail: not installed"
fi

if command -v bwrap &>/dev/null; then
    BW_VER=$(bwrap --version 2>/dev/null | head -1)
    echo -e "  ${GREEN}✓${NC} bubblewrap: ${BW_VER}"
    BWRAP_OK=true
else
    echo -e "  ${YELLOW}✗${NC} bubblewrap: not installed"
fi

echo ""

if $FIREJAIL_OK && $BWRAP_OK; then
    echo -e "${GREEN}[OK]${NC} Both firejail and bubblewrap are already installed!"
    echo ""
    echo -e "  You can use the ${GREEN}🛡 Sandbox${NC} button in P2N to safely inspect files."
    echo ""
    exit 0
fi

# ── Install ────────────────────────────────────────────────────────────────
echo -e "${BLUE}[*]${NC} Installing missing packages..."
echo ""

install_packages

echo ""

# ── Verify ─────────────────────────────────────────────────────────────────
echo -e "${BLUE}[*]${NC} Verifying installation..."
echo ""

ERRORS=0

if command -v firejail &>/dev/null; then
    echo -e "  ${GREEN}✓${NC} firejail installed successfully"
else
    echo -e "  ${RED}✗${NC} firejail installation failed"
    ERRORS=$((ERRORS + 1))
fi

if command -v bwrap &>/dev/null; then
    echo -e "  ${GREEN}✓${NC} bubblewrap installed successfully"
else
    echo -e "  ${RED}✗${NC} bubblewrap installation failed"
    ERRORS=$((ERRORS + 1))
fi

echo ""

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  [OK] Linux Sandbox setup complete!${NC}"
    echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  You can now use the ${GREEN}🛡 Sandbox${NC} button in P2N."
    echo -e "  firejail creates isolated network namespaces for safe file inspection."
    echo ""
else
    echo -e "${RED}[ERROR]${NC} Some packages failed to install."
    echo -e "  Try installing manually:"
    echo -e "    sudo apt install firejail bubblewrap     # Debian/Ubuntu"
    echo -e "    sudo dnf install firejail bubblewrap     # Fedora/RHEL"
    echo -e "    sudo pacman -S firejail bubblewrap       # Arch"
    echo ""
    exit 1
fi

exit 0
