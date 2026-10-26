<div align="center">


![Uncode — local voice dictation](banner.png)


<h3 >
Local voice dictation for Linux
</h3 >

Hold to record; release to transcribe and paste. Powered by [Whistle](https://cactuscompute.com/blog/whistle) (16.9 MB).

[![Release](https://img.shields.io/github/v/release/xLongLink/uncode)](https://github.com/xLongLink/uncode/releases/latest)
[![Release workflow](https://github.com/xLongLink/uncode/actions/workflows/release.yml/badge.svg)](https://github.com/xLongLink/uncode/actions/workflows/release.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)


</div>

<br />

## Features

- 🎙️ **Hold to record**: Press and hold a key to record; release to transcribe and paste the text.
- 🔇 **Automatic audio muting**: System audio is muted while recording, so you can dictate even while listening to music.
- 🔒 **Entirely local**: Runs on your machine, with no cloud required.
- 🐧 **Ubuntu tested**: Tested on Ubuntu 26.04.
- ⏱️ **Up to 30 seconds**: Record clips up to Whistle's 30-second limit.

<br />

## Install


```sh
curl -fsSL https://github.com/xLongLink/uncode/releases/latest/download/install.sh | bash
```


### Uninstall

```sh
curl -fsSL https://github.com/xLongLink/uncode/releases/latest/download/uninstall.sh | bash
```

<br />


## Development

```sh
make up         # Install it locally
make check      # 
make fmt        # 
make down       # Uninstall it
```

<br />

## Release

Commit and push changes, then push an annotated version tag:

```sh
git tag -a v0.0.1
git push origin v0.0.1
```

<br />

---

<div align="center">
LongLink 2026

[License](./LICENSE) &nbsp; - &nbsp; [Contributing](./CONTRIBUTING.md) &nbsp; - &nbsp; [Code of Conduct](./CODE_OF_CONDUCT.md) &nbsp; - &nbsp; [Contact](mailto:info@longlink.dev)

</div>

---
