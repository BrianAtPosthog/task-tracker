#!/bin/bash
# Part 1 of 2 (no sudo): hold the Mac awake for 60 minutes at 05:55 and 13:55 every day.
# launchd runs a missed calendar job as soon as the Mac wakes, so a late wake still gets its hold.
# If you're actively using the Mac, normal activity keeps it awake past the hour anyway.
# Part 2 is scripts/install-wake-daemon.sh (run with sudo): the actual scheduled wakes.
# Usage: bash scripts/install-wake-schedule.sh
set -euo pipefail
LABEL=com.task-tracker.stay-awake
AGENTS="$HOME/Library/LaunchAgents"
mkdir -p "$AGENTS" "$HOME/.task-tracker"
cat > "$AGENTS/$LABEL.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>/usr/bin/caffeinate</string><string>-s</string><string>-i</string><string>-t</string><string>3600</string>
  </array>
  <key>StartCalendarInterval</key><array>
    <dict><key>Hour</key><integer>5</integer><key>Minute</key><integer>55</integer></dict>
    <dict><key>Hour</key><integer>13</integer><key>Minute</key><integer>55</integer></dict>
  </array>
  <key>StandardOutPath</key><string>$HOME/.task-tracker/stay-awake.log</string>
  <key>StandardErrorPath</key><string>$HOME/.task-tracker/stay-awake.log</string>
</dict></plist>
EOF
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$AGENTS/$LABEL.plist"
echo "Installed: Mac held awake 05:55–06:55 and 13:55–14:55 daily."
echo "Next, run part 2 for the scheduled wakes:"
echo "  sudo bash $(cd "$(dirname "$0")" && pwd)/install-wake-daemon.sh"
