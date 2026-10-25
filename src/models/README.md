# Bundled Whistle model

`whistle.cact` is the unmodified Cactus Compute Whistle speech model, included
directly in Git so cloning this repository needs no separate model download or
Git LFS setup.

- Source: https://huggingface.co/Cactus-Compute/whistle
- Revision: `ca5287601bef25af26dcf2e1b2bdc0843a7c19e5`
- SHA-256: `b6e02f048568ac5d01a2042556c658061e699acbc0aa2a1439f52f3d461dffeb`
- License: Apache-2.0 (see `LICENSE` in this directory)

The compatible platform-specific native engine is downloaded separately into
`${XDG_CACHE_HOME:-~/.cache}/uncode` for compiled installs, or `src/.cache` when
running from source. Compiled executables embed the model and its license.
