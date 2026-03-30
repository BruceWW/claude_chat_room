#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; }

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
ERRORS=0

echo "Claude Chat Room — Setup"
echo "========================"
echo ""

# --- Check Python ---
echo "Checking Python..."
if command -v python3 &>/dev/null; then
    PY_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
    PY_MAJOR=$(echo "$PY_VERSION" | cut -d. -f1)
    PY_MINOR=$(echo "$PY_VERSION" | cut -d. -f2)
    if [ "$PY_MAJOR" -ge 3 ] && [ "$PY_MINOR" -ge 11 ]; then
        ok "Python $PY_VERSION"
    else
        fail "Python $PY_VERSION (need 3.11+)"
        ERRORS=$((ERRORS + 1))
    fi
else
    fail "Python not found"
    ERRORS=$((ERRORS + 1))
fi

# --- Check Node.js ---
echo "Checking Node.js..."
if command -v node &>/dev/null; then
    NODE_VERSION=$(node --version | sed 's/v//')
    NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
    if [ "$NODE_MAJOR" -ge 18 ]; then
        ok "Node.js v$NODE_VERSION"
    else
        fail "Node.js v$NODE_VERSION (need 18+)"
        ERRORS=$((ERRORS + 1))
    fi
else
    fail "Node.js not found"
    ERRORS=$((ERRORS + 1))
fi

# --- Check Claude CLI ---
echo "Checking Claude Code CLI..."
if command -v claude &>/dev/null; then
    CLAUDE_VERSION=$(claude --version 2>&1 | head -1)
    ok "Claude CLI $CLAUDE_VERSION"
else
    fail "Claude CLI not found (install: npm install -g @anthropic-ai/claude-code)"
    ERRORS=$((ERRORS + 1))
fi

# --- Abort if prerequisites missing ---
if [ "$ERRORS" -gt 0 ]; then
    echo ""
    fail "Missing $ERRORS prerequisite(s). Fix them and re-run."
    exit 1
fi

echo ""
echo "Installing dependencies..."

# --- Python deps ---
echo "Installing Python packages..."
cd "$PROJECT_DIR"
python3 -m pip install -r requirements.txt -q 2>&1 | tail -1
ok "Python packages installed"

# --- Node deps ---
echo "Installing Node packages..."
cd "$PROJECT_DIR/web"
npm install --silent 2>&1 | tail -1
ok "Node packages installed"

# --- Build frontend ---
echo "Building frontend..."
npm run build --silent 2>&1 | tail -1
ok "Frontend built → web/dist/"

# --- Create default config if not exists ---
cd "$PROJECT_DIR"
if [ ! -f config.yaml ]; then
    cat > config.yaml << 'EOF'
room:
  name: "my-workspace"
  max_turns_per_round: 3
  cooldown_seconds: 2

agents: []
EOF
    ok "Created default config.yaml"
else
    ok "config.yaml exists"
fi

# --- Verify ---
echo ""
echo "Verifying installation..."
python3 -c "import fastapi; import aiosqlite; import yaml; import claude_code_sdk; print('OK')" 2>&1
ok "All Python imports OK"

echo ""
echo -e "${GREEN}Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Edit config.yaml to add your agents (or use the web UI)"
echo "  2. Run: python3 -m server.main"
echo "  3. Open: http://localhost:8000"
