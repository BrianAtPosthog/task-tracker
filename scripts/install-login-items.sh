#!/bin/bash
# Installs two login items (launchd agents): the task server and the ngrok tunnel.
# Both start at login and restart if they crash. Re-run this any time to update them.
# Usage: scripts/install-login-items.sh <ngrok-static-domain>
set -euo pipefail
DOMAIN="${1:?Usage: $0 <ngrok-static-domain>}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
NGROK="$(command -v ngrok)"
LOGS="$HOME/.task-tracker"
AGENTS="$HOME/Library/LaunchAgents"
mkdir -p "$LOGS" "$AGENTS"

write_plist() { # label, log name, program args (xml)
  cat > "$AGENTS/$1.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$1</string>
  <key>ProgramArguments</key><array>$3</array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOGS/$2.log</string>
  <key>StandardErrorPath</key><string>$LOGS/$2.log</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
</dict></plist>
EOF
  launchctl bootout "gui/$(id -u)/$1" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$AGENTS/$1.plist"
}

write_plist com.task-tracker.server server \
  "<string>$NODE</string><string>--no-warnings</string><string>$DIR/src/server.js</string>"
write_plist com.task-tracker.ngrok ngrok \
  "<string>$NGROK</string><string>http</string><string>--url=$DOMAIN</string><string>3789</string><string>--log=stdout</string>"

echo "Installed. Server + tunnel now start at login."
echo "MCP URL for ChatGPT: https://$DOMAIN/mcp/$(cat "$LOGS/mcp-token")"
