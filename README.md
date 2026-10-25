![Uncode — local voice dictation](banner.png)

[![Release](https://img.shields.io/github/v/release/xLongLink/uncode)](https://github.com/xLongLink/uncode/releases/latest)
[![Release workflow](https://github.com/xLongLink/uncode/actions/workflows/release.yml/badge.svg)](https://github.com/xLongLink/uncode/actions/workflows/release.yml)
[![Bun](https://img.shields.io/badge/runtime-Bun-14151a)](https://bun.sh)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

Local voice dictation for your desktop.

Hold Copilot to record; release to transcribe locally and paste. Never submits the text.

Requires Ubuntu/Debian Wayland, x86_64 or ARM64, and a supported Copilot keyboard.

## Install

Bun and Node.js are not required:

```sh
curl -fsSL https://github.com/xLongLink/uncode/releases/latest/download/install.sh | bash
```

The installer detects your architecture and verifies the compiled executable's checksum.
The executable embeds the app, setup script, speech model, and licenses. Run as
your desktop user; sudo is used for system dependencies and device permissions.
It copies itself under `${XDG_DATA_HOME:-~/.local/share}/uncode/releases` and prints
the uninstall command. Temporary downloads are removed automatically.
The native speech engine downloads separately into `${XDG_CACHE_HOME:-~/.cache}/uncode`.
See the [Voice README](src/README.md) for permissions and usage.

### From source

Install [Bun](https://bun.sh) for development, then:

```sh
git clone https://github.com/xLongLink/uncode.git
cd uncode
make up
```

Uninstall with `make down`.

## Development

```sh
bun install --cwd src
make check
make fmt
```

`src/` is an independent Bun package with its own dependencies,
lockfile, checks, tests, license, and release tooling. It can be copied
out and developed without the root. Inside `src/`,
run `bun install`, `bun run check`, `bun test`, or `bun run build`.
Root Make targets run commands inside `src/`; the root has no JavaScript package
or tooling configuration.

Checks cover formatting, linting, types, builds, Bash syntax, and the Voice
test suite. Run the suite separately with `make test`, which runs tests inside `src/`.
Ordinary tests do not contact AI providers. For native inference, run
`VOICE_NATIVE_TEST=1 bun test` inside `src/`.

## Release

Commit and push changes, then push an annotated version tag:

```sh
git tag -a v0.0.1
git push origin v0.0.1
```
