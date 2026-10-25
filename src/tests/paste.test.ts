import { afterEach, beforeEach, expect, spyOn, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises"
import { pasteText } from "../src/paste.ts"
import { key, type InputEvent } from "../src/hotkey.ts"

let directory: string
let previousPath: string | undefined
let info: ReturnType<typeof spyOn<typeof console, "info">>
let warning: ReturnType<typeof spyOn<typeof console, "warn">>

beforeEach(async () => {
	await mkdir("/tmp/opencode", { recursive: true })
	directory = await mkdtemp("/tmp/opencode/voice-paste-")
	previousPath = process.env.PATH
	info = spyOn(console, "info").mockImplementation(() => {})
	warning = spyOn(console, "warn").mockImplementation(() => {})
	await Bun.write(
		`${directory}/wl-copy`,
		`#!/bin/sh
if [ "$1" = --primary ]; then
  [ -f '${directory}/fail-primary' ] && exit 1
  /bin/cat > '${directory}/primary'
else
  [ -f '${directory}/fail-clipboard' ] && exit 1
  /bin/cat > '${directory}/clipboard'
fi
`,
	)
	await chmod(`${directory}/wl-copy`, 0o755)
	process.env.PATH = `${directory}:${previousPath}`
})

afterEach(async () => {
	process.env.PATH = previousPath
	info.mockRestore()
	warning.mockRestore()
	await rm(directory, { recursive: true, force: true })
})

test("copies both selections before emitting Shift+Insert", async () => {
	const events: InputEvent[] = []
	pasteText("spoken text", (event) => events.push(event))
	expect(await Bun.file(`${directory}/clipboard`).text()).toBe("spoken text")
	expect(await Bun.file(`${directory}/primary`).text()).toBe("spoken text")
	expect(events).toEqual([
		{ type: 1, code: key.shift, value: 1 },
		{ type: 1, code: key.insert, value: 1 },
		{ type: 0, code: 0, value: 0 },
		{ type: 1, code: key.insert, value: 0 },
		{ type: 1, code: key.shift, value: 0 },
		{ type: 0, code: 0, value: 0 },
	])
})

test("unsupported primary selection still pastes from the clipboard", async () => {
	await Bun.write(`${directory}/fail-primary`, "")
	const events: InputEvent[] = []
	expect(() => pasteText("spoken text", (event) => events.push(event))).not.toThrow()
	expect(await Bun.file(`${directory}/clipboard`).text()).toBe("spoken text")
	expect(events).toHaveLength(6)
	expect(warning).toHaveBeenCalledTimes(1)
})

test("failed clipboard copies do not synthesize a paste of stale text", async () => {
	await Bun.write(`${directory}/fail-clipboard`, "")
	const events: InputEvent[] = []
	expect(() => pasteText("spoken text", (event) => events.push(event))).toThrow(
		"Clipboard copy failed",
	)
	expect(events).toEqual([])
})
