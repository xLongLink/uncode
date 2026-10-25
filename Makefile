.PHONY: up down test check build fmt lint

build:
	bun run --cwd src build

up:
	bun run --cwd src up

down:
	bun run --cwd src down

test:
	bun run --cwd src test

check:
	bun run --cwd src check

fmt:
	bun run --cwd src fmt

lint:
	bun run --cwd src lint
