#!/usr/bin/env bash
# ==============================================================================
# OmniTerm - Automated Linux Setup & Build Script
# ==============================================================================
set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================================${NC}"
echo -e "${GREEN}      OmniTerm - Linux Desktop Setup & Packaging      ${NC}"
echo -e "${BLUE}======================================================${NC}"

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}[ERROR] Node.js is not installed.${NC}"
    echo "Please install Node.js (v18+ recommended) via your distribution package manager or https://nodejs.org"
    exit 1
fi

echo -e "${GREEN}[1/4] Checking Node.js runtime environment...${NC}"
echo "Node Version: $(node -v)"
echo "NPM Version: $(npm -v)"

# Install dependencies
echo -e "${GREEN}[2/4] Installing project dependencies...${NC}"
npm install

# Compile full-stack bundle
echo -e "${GREEN}[3/4] Building production React frontend and Express server...${NC}"
npm run build

# Desktop shortcut installation option
echo -e "${GREEN}[4/4] Configuring Linux system desktop integration...${NC}"
mkdir -p "$HOME/.local/bin"
mkdir -p "$HOME/.local/share/applications"

# Create binary launcher script
LAUNCHER_PATH="$HOME/.local/bin/omniterm"
cat << 'EOF' > "$LAUNCHER_PATH"
#!/usr/bin/env bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
PROJECT_DIR="$(dirname "$(dirname "$DIR")")"

# Navigate to OmniTerm project directory or current dir
if [ -f "./dist/server.cjs" ]; then
    node dist/server.cjs
elif [ -d "$HOME/omniterm" ]; then
    cd "$HOME/omniterm" && node dist/server.cjs
else
    echo "Starting OmniTerm server..."
    node "$DIR/dist/server.cjs"
fi
EOF
chmod +x "$LAUNCHER_PATH"

# Copy desktop entry
cp omniterm.desktop "$HOME/.local/share/applications/omniterm.desktop" 2>/dev/null || true

echo ""
echo -e "${GREEN}======================================================${NC}"
echo -e "${GREEN}  ✓ OmniTerm build & setup completed successfully!   ${NC}"
echo -e "${GREEN}======================================================${NC}"
echo ""
echo -e "${YELLOW}To launch OmniTerm:${NC}"
echo "  1. Start directly:          npm start"
echo "  2. Build standalone .deb:   npx electron-builder --linux deb"
echo "  3. Build .AppImage:         npx electron-builder --linux AppImage"
echo ""
