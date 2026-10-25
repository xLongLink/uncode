#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
    install|uninstall) ;;
    *) printf 'Usage: uncode install|uninstall\n' >&2; exit 1 ;;
esac

action="$1"
shift
if [[ "$#" == 0 ]]; then
    printf 'Run setup through uncode or bun run up/down.\n' >&2
    exit 1
fi
runner=("$@")
config="${XDG_CONFIG_HOME:-$HOME/.config}/uncode-voice.json"
unit="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/uncode-voice.service"
rule=/etc/udev/rules.d/70-uncode-voice.rules
module=/etc/modules-load.d/uncode-voice.conf

if [[ "$EUID" == 0 ]]; then
    printf 'Run as your desktop user, not root; sudo is used only for system setup.\n' >&2
    exit 1
fi

if [[ "$action" == uninstall ]]; then
    systemctl --user disable --now uncode-voice.service 2>/dev/null || true
    rm -f "$unit" "$config"
    if [[ -e "$rule" || -e "$module" ]]; then
        sudo rm -f "$rule" "$module"
        sudo udevadm control --reload-rules
        sudo udevadm trigger --subsystem-match=input --action=change
        sudo udevadm trigger --subsystem-match=misc --action=change
    fi
    systemctl --user daemon-reload
    printf 'Voice removed. Log out and back in to fully revoke device access.\n'
    printf 'The local Whistle download cache is retained.\n'
    exit 0
fi

if [[ "${XDG_SESSION_TYPE:-}" != wayland ]]; then
    printf 'Install from a terminal in your Wayland desktop session.\n' >&2
    exit 1
fi
if ! command -v apt-get >/dev/null; then
    printf 'This installer supports Ubuntu/Debian (apt-get). See README.md.\n' >&2
    exit 1
fi

printf 'Installs Whistle locally and grants this desktop user selected keyboard/uinput access.\n'
sudo apt-get install -y pipewire-bin wireplumber wl-clipboard unzip
# Download the native engine and verify the bundled model before changing keyboard permissions.
"${runner[@]}" setup download
systemctl --user stop uncode-voice.service 2>/dev/null || true

shopt -s nullglob
keyboards=(/dev/input/by-id/*-event-kbd /dev/input/by-path/*-event-kbd)
if [[ "${#keyboards[@]}" == 0 ]]; then
    printf 'No stable keyboard device found under /dev/input/by-id or by-path.\n' >&2
    exit 1
fi
if [[ -n "${VOICE_KEYBOARD:-}" ]]; then
    keyboards=("$VOICE_KEYBOARD")
fi
# Read only during detection; do not grant access to every keyboard.
selection="$(sudo "${runner[@]}" setup detect "${keyboards[@]}")"
IFS=$'\t' read -r keyboard keycode <<< "$selection"
printf 'Selected keyboard: %s (key code %s)\n' "$keyboard" "$keycode"
case "$keyboard" in
    /dev/input/by-id/*-event-kbd|/dev/input/by-path/*-event-kbd) ;;
    *) printf 'VOICE_KEYBOARD must be a stable event-kbd device path.\n' >&2; exit 1 ;;
esac
if [[ ! -e "$keyboard" || "$keyboard" == *[\"\\\*\?\[]* ]]; then
    printf 'Invalid keyboard path: %s\n' "$keyboard" >&2
    exit 1
fi

sudo modprobe uinput
printf 'uinput\n' | sudo tee "$module" >/dev/null
printf 'SUBSYSTEM=="input", KERNEL=="event*", ENV{DEVLINKS}=="*%s*", TAG+="uaccess"\nSUBSYSTEM=="misc", KERNEL=="uinput", TAG+="uaccess"\n' \
    "$keyboard" | sudo tee "$rule" >/dev/null
sudo udevadm control --reload-rules
sudo udevadm trigger --subsystem-match=input --action=change
sudo udevadm trigger --subsystem-match=misc --action=change
sudo udevadm settle

if [[ ! -r "$keyboard" || ! -w /dev/uinput ]]; then
    printf 'Device access not yet active. Log out/in, then rerun the install command.\n' >&2
    exit 1
fi
"${runner[@]}" setup check "$keyboard" "$keycode"

mkdir -p "$(dirname "$unit")"
"${runner[@]}" setup configure "$keyboard" "$config" "$unit" "$keycode"
for name in WAYLAND_DISPLAY DISPLAY XDG_SESSION_TYPE XDG_CURRENT_DESKTOP XDG_CONFIG_HOME; do
    if [[ -v "$name" ]]; then systemctl --user import-environment "$name"; fi
done
systemctl --user daemon-reload
systemctl --user enable --now uncode-voice.service
printf 'Voice installed. Hold your selected key, speak, release to paste.\n'
printf 'Status/logs: journalctl --user -u uncode-voice.service -f\n'
