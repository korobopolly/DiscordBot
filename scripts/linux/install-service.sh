#!/bin/bash

# Discord Bot systemd service installer

set -e

# Get script directory and bot directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
SERVICE_TEMPLATE="$SCRIPT_DIR/discord-bot.service"
DEST="/etc/systemd/system/discord-bot.service"

# Get current user (use SUDO_USER if running with sudo, otherwise whoami)
if [ -n "$SUDO_USER" ]; then
    CURRENT_USER="$SUDO_USER"
else
    CURRENT_USER=$(whoami)
fi

# Get node path
NODE_PATH=$(which node 2>/dev/null)
if [ -z "$NODE_PATH" ]; then
    echo "Error: Node.js not found. Please install Node.js first."
    exit 1
fi

# Verify bot directory has index.js
if [ ! -f "$BOT_DIR/index.js" ]; then
    echo "Error: index.js not found in $BOT_DIR"
    exit 1
fi

echo "Installing Discord Bot service..."
echo "User: $CURRENT_USER"
echo "Directory: $BOT_DIR"
echo "Node path: $NODE_PATH"

# Stop existing service if running
sudo systemctl stop discord-bot 2>/dev/null || true

# Create service file with actual values
sudo bash -c "cat > $DEST << EOF
[Unit]
Description=Discord Utility Bot
After=network.target

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$BOT_DIR
ExecStart=$NODE_PATH --watch index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
Environment=NODE_ENV=development

[Install]
WantedBy=multi-user.target
EOF"

# Reload systemd and enable service
sudo systemctl daemon-reload
sudo systemctl enable discord-bot
sudo systemctl start discord-bot

echo ""
echo "Installation complete!"
echo ""
echo "Commands:"
echo "  sudo systemctl status discord-bot   - Check status"
echo "  sudo systemctl stop discord-bot     - Stop bot"
echo "  sudo systemctl restart discord-bot  - Restart bot"
echo "  journalctl -u discord-bot -f        - View logs"
