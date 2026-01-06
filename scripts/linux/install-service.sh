#!/bin/bash

# Discord Bot systemd service installer

set -e

# Get current user and directory
CURRENT_USER=$(whoami)
BOT_DIR=$(pwd)
SERVICE_FILE="discord-bot.service"
DEST="/etc/systemd/system/$SERVICE_FILE"

echo "Installing Discord Bot service..."
echo "User: $CURRENT_USER"
echo "Directory: $BOT_DIR"

# Update service file with actual values
sed -i "s|YOUR_USERNAME|$CURRENT_USER|g" $SERVICE_FILE
sed -i "s|/home/YOUR_USERNAME/DiscordBot|$BOT_DIR|g" $SERVICE_FILE

# Copy service file
sudo cp $SERVICE_FILE $DEST

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
