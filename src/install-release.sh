#!/usr/bin/env bash
set -euo pipefail

main() {
    version='@VERSION@'
    if [[ "$(uname -s)" != Linux || "${XDG_SESSION_TYPE:-}" != wayland ]]; then
        printf 'Run the installer from your Ubuntu/Debian Wayland desktop.\n' >&2
        exit 1
    fi
    case "$(uname -m)" in
        x86_64) arch=x64 ;;
        aarch64|arm64) arch=arm64 ;;
        *) printf 'Unsupported architecture.\n' >&2; exit 1 ;;
    esac
    for command in curl sha256sum mktemp chmod rm; do
        command -v "$command" >/dev/null || { printf 'Required command not found: %s\n' "$command" >&2; exit 1; }
    done
    name="uncode-linux-$arch"
    url="https://github.com/xLongLink/uncode/releases/download/$version"
    download=$(mktemp -d)
    trap 'rm -rf -- "$download"' EXIT
    for file in "$name" "$name.sha256"; do
        curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
            --output "$download/$file" "$url/$file"
    done
    read -r digest filename extra < "$download/$name.sha256"
    if [[ ! "$digest" =~ ^[[:xdigit:]]{64}$ || "$filename" != "$name" || -n "$extra" ]]; then
        printf 'Invalid release checksum file.\n' >&2
        exit 1
    fi
    (cd "$download" && sha256sum --check "$name.sha256")
    chmod +x "$download/$name"
    "$download/$name" install
}

main "$@"
