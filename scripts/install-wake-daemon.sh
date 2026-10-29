#!/bin/bash
# Part 2 of 2 (run with sudo): make the Mac wake at 05:50 and 13:50 every day.
# macOS allows only ONE repeating wake (pmset repeat), so:
#   - pmset repeat handles 05:50 daily
#   - a root LaunchDaemon runs at 06:00 (and at boot) and schedules a one-off wake for the next 13:50
# Requirements: Mac plugged into power. A closed MacBook lid needs an external display for scheduled wakes to fire.
# Usage: sudo bash scripts/install-wake-daemon.sh      Undo: sudo bash scripts/install-wake-daemon.sh --uninstall
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo."; exit 1; }
LABEL=com.task-tracker.wake
HELPER=/usr/local/bin/task-tracker-schedule-wake
PLIST=/Library/LaunchDaemons/$LABEL.plist

if [ "${1:-}" = "--uninstall" ]; then
  launchctl bootout system "$PLIST" 2>/dev/null || true
  rm -f "$PLIST" "$HELPER"
  pmset repeat cancel
  pmset schedule cancelall 2>/dev/null || true
  echo "Removed wake schedule."; exit 0
fi

mkdir -p /usr/local/bin
cat > "$HELPER" <<'EOF'
#!/bin/bash
# Schedules a one-off wake for the next 13:50 (today if still ahead, else tomorrow).
now=$(date +%s); target=$(date -j -f "%H:%M:%S" "13:50:00" +%s)
[ "$target" -le "$now" ] && target=$((target + 86400))
when=$(date -r "$target" "+%m/%d/%y 13:50:00")
pmset schedule wake "$when" && echo "$(date): scheduled wake $when" >> /var/log/task-tracker-wake.log
EOF
chmod 755 "$HELPER"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$HELPER</string></array>
  <key>RunAtLoad</key><true/>
  <key>StartCalendarInterval</key><array>
    <dict><key>Hour</key><integer>6</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Hour</key><integer>15</integer><key>Minute</key><integer>0</integer></dict>
  </array>
</dict></plist>
EOF
chown root:wheel "$PLIST"; chmod 644 "$PLIST"
launchctl bootout system "$PLIST" 2>/dev/null || true
launchctl bootstrap system "$PLIST"
pmset repeat wakeorpoweron MTWRFSU 05:50:00
echo "Installed. Repeating wake 05:50 daily; one-off 13:50 wake scheduled by the daemon each morning."
echo; pmset -g sched
