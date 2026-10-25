# Agent Instructions

This repository contains a standalone voice integration in `src/`, not an OpenCode
runtime or CLI fork. Do not reintroduce bundled runtime packages or alter
installed OpenCode data.

## Style

- Use TypeScript on Bun and Bash where shell integration requires it. Vite+ owns formatting, linting, and type checks; Bun runs integration tests.
- Keep imports named; avoid import aliases and star imports.
- Prefer `const`, early returns, and small readable functions.
- Inline single-use helpers unless they name a meaningful boundary.
- Validate unknown values at their owning boundary, not repeatedly.
- Prefer Bun APIs such as `Bun.file()` where appropriate.
- Avoid speculative complexity; explain concrete failure modes before expanding scope.
- Preserve unrelated user files, shell settings, credentials, sessions, and device permissions.

## Checks

- Run `make check` from the repository root.
- Run tests from `src/`, never directly from the root.
- Tests exercise the real implementation and do not contact AI providers.
- Use `VOICE_NATIVE_TEST=1 bun test` inside `src/` for actual native inference.
- Keep Make targets in the repository-root Makefile only; run integration tests in their respective folders.
