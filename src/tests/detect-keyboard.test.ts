import { afterEach, beforeEach, expect, test } from "bun:test"
import { appendFile, mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import { detectKeyboard } from "../src/detect-keyboard.ts"
import { encodeEvent } from "../src/keyboard.ts"
import { key } from "../src/hotkey.ts"

let directory: string

beforeEach(async () => {
	await mkdir("/tmp/opencode", { recursive: true })
	directory = await mkdtemp("/tmp/opencode/voice-keyboard-")
})

afterEach(async () => {
	await rm(directory, { recursive: true, force: true })
})

test("detects the selected key and keyboard, ignoring releases and repeats", async () => {
	const first = `${directory}/first`
	const second = `${directory}/second`
	await Bun.write(
		first,
		Buffer.concat([
			encodeEvent({ type: 4, code: 4, value: 1 }),
			encodeEvent({ type: 1, code: key.copilot, value: 0 }),
			encodeEvent({ type: 1, code: key.copilot, value: 2 }),
		]),
	)
	await Bun.write(second, encodeEvent({ type: 1, code: 58, value: 1 }))
	expect(await detectKeyboard([first, second])).toEqual({ keyboard: second, keycode: 58 })
})

test("waits for a new key press", async () => {
	const device = `${directory}/keyboard`
	await Bun.write(device, "")
	const result = detectKeyboard([device], 1000)
	await appendFile(device, encodeEvent({ type: 1, code: key.shift, value: 1 }))
	expect(await result).toEqual({ keyboard: device, keycode: key.shift })
})

test("deduplicates stable aliases and prefers the first path", async () => {
	const device = `${directory}/keyboard`
	const alias = `${directory}/alias`
	await Bun.write(device, encodeEvent({ type: 1, code: key.copilot, value: 1 }))
	await symlink(device, alias)
	expect(await detectKeyboard([alias, device])).toEqual({ keyboard: alias, keycode: key.copilot })
})

test("skips unavailable devices", async () => {
	const device = `${directory}/keyboard`
	await Bun.write(device, encodeEvent({ type: 1, code: key.copilot, value: 1 }))
	expect(await detectKeyboard([`${directory}/missing`, device])).toEqual({
		keyboard: device,
		keycode: key.copilot,
	})
})

test("fails clearly when no device can be opened", async () => {
	await expect(detectKeyboard([`${directory}/missing`])).rejects.toThrow(
		"No keyboard devices could be opened",
	)
})

test("times out instead of waiting indefinitely for an unsupported keyboard", async () => {
	const device = `${directory}/keyboard`
	await Bun.write(device, "")
	await expect(detectKeyboard([device], 20)).rejects.toThrow("No key press detected")
})
