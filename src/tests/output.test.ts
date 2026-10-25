import { afterEach, beforeEach, expect, spyOn, test } from "bun:test"
import { mkdir, mkdtemp, chmod, rm } from "node:fs/promises"
import { captureAudio } from "../src/microphone.ts"
import { muteOutput } from "../src/output.ts"

let directory: string
let previousPath: string | undefined
let warning: ReturnType<typeof spyOn<typeof console, "warn">>

beforeEach(async () => {
	await mkdir("/tmp/opencode", { recursive: true })
	directory = await mkdtemp("/tmp/opencode/voice-output-")
	previousPath = process.env.PATH
	warning = spyOn(console, "warn").mockImplementation(() => {})
	await Bun.write(`${directory}/state.json`, JSON.stringify({ muted: false, volume: 0.65 }))
	await Bun.write(
		`${directory}/wpctl.js`,
		`
const root = import.meta.dir
const args = process.argv.slice(2)
const state = await Bun.file(root + "/state.json").json()
const file = Bun.file(root + "/calls.json")
const calls = await file.exists() ? await file.json() : []
calls.push(args)
await Bun.write(file, JSON.stringify(calls))
if (state.fail === args[0]) process.exit(1)
if (args[0] === "inspect") console.log(state.invalid ? "invalid" : "id 60, type PipeWire:Interface:Node")
if (args[0] === "get-volume") console.log("Volume: " + state.volume.toFixed(2) + (state.muted ? " [MUTED]" : ""))
if (args[0] === "set-mute") {
  state.muted = args[2] === "1"
  await Bun.write(root + "/state.json", JSON.stringify(state))
}
`,
	)
	await Bun.write(
		`${directory}/wpctl`,
		`#!/bin/sh\nexec '${process.execPath}' '${directory}/wpctl.js' "$@"\n`,
	)
	await chmod(`${directory}/wpctl`, 0o755)
	process.env.PATH = `${directory}:${previousPath}`
})

afterEach(async () => {
	process.env.PATH = previousPath
	warning.mockRestore()
	await rm(directory, { recursive: true, force: true })
})

async function state() {
	return Bun.file(`${directory}/state.json`).json()
}

async function calls() {
	return (await Bun.file(`${directory}/calls.json`).json()) as string[][]
}

async function recorder(source: string) {
	await Bun.write(`${directory}/pw-record.js`, source)
	await Bun.write(
		`${directory}/pw-record`,
		`#!/bin/sh\nexec '${process.execPath}' '${directory}/pw-record.js' "$@"\n`,
	)
	await chmod(`${directory}/pw-record`, 0o755)
}

test("mutes playback and restores the same output once without changing volume", async () => {
	const restore = muteOutput()
	expect(await state()).toEqual({ muted: true, volume: 0.65 })
	restore()
	restore()
	expect(await state()).toEqual({ muted: false, volume: 0.65 })
	expect(await calls()).toEqual([
		["inspect", "@DEFAULT_AUDIO_SINK@"],
		["get-volume", "60"],
		["set-mute", "60", "1"],
		["set-mute", "60", "0"],
	])
})

test("an already-muted output stays muted", async () => {
	await Bun.write(`${directory}/state.json`, JSON.stringify({ muted: true, volume: 0.35 }))
	muteOutput()()
	expect(await state()).toEqual({ muted: true, volume: 0.35 })
	expect((await calls()).map((args) => args[0])).toEqual(["inspect", "get-volume"])
})

test("audio-control failures warn without blocking dictation", async () => {
	await Bun.write(
		`${directory}/state.json`,
		JSON.stringify({ muted: false, volume: 0.65, fail: "set-mute" }),
	)
	expect(() => muteOutput()()).not.toThrow()
	expect((await state()).muted).toBe(false)
	expect(warning).toHaveBeenCalledTimes(1)
})

test("invalid output information never changes mute state", async () => {
	await Bun.write(
		`${directory}/state.json`,
		JSON.stringify({ muted: false, volume: 0.65, invalid: true }),
	)
	muteOutput()()
	expect(await calls()).toEqual([["inspect", "@DEFAULT_AUDIO_SINK@"]])
	expect(warning).toHaveBeenCalledTimes(1)
})

test("missing wpctl warns without blocking dictation", () => {
	process.env.PATH = `${directory}/missing`
	expect(() => muteOutput()()).not.toThrow()
	expect(warning).toHaveBeenCalledTimes(1)
})

test("restoration failures can be retried during cleanup", async () => {
	const restore = muteOutput()
	await Bun.write(
		`${directory}/state.json`,
		JSON.stringify({ muted: true, volume: 0.65, fail: "set-mute" }),
	)
	restore()
	expect(warning).toHaveBeenCalledTimes(1)
	await Bun.write(`${directory}/state.json`, JSON.stringify({ muted: true, volume: 0.65 }))
	restore()
	expect((await state()).muted).toBe(false)
})

test("releasing the button restores playback immediately", async () => {
	await recorder("setInterval(() => {}, 1000)")
	const recording = captureAudio()
	try {
		expect((await state()).muted).toBe(true)
		recording.stop()
		expect((await state()).muted).toBe(false)
	} finally {
		recording.stop()
		await recording.result
	}
	expect((await calls()).filter((args) => args[0] === "set-mute")).toHaveLength(2)
})

test("microphone failures restore playback", async () => {
	await recorder('console.error("microphone unavailable"); process.exit(1)')
	const recording = captureAudio()
	await expect(recording.result).rejects.toThrow("microphone unavailable")
	expect((await state()).muted).toBe(false)
})

test("missing microphone command restores playback", async () => {
	process.env.PATH = directory
	const recording = captureAudio()
	await expect(recording.result).rejects.toThrow("pw-record")
	expect((await state()).muted).toBe(false)
})

test("reaching the recording size limit restores playback without release", async () => {
	await recorder(
		"process.stdout.write(Buffer.alloc(16000 * 30 * 2)); setInterval(() => {}, 1000)",
	)
	const recording = captureAudio()
	expect((await recording.result).length).toBe(16000 * 30)
	expect((await state()).muted).toBe(false)
})

test("a microphone ignoring SIGINT is killed and the captured audio is retained", async () => {
	await recorder(`
process.on("SIGINT", () => {})
process.stdout.write(Buffer.from([0, 64]))
await Bun.write(import.meta.dir + "/ready", "ready")
setInterval(() => {}, 1000)
`)
	const recording = captureAudio()
	try {
		const deadline = performance.now() + 1000
		while (!(await Bun.file(`${directory}/ready`).exists())) {
			if (performance.now() > deadline) throw new Error("Fake microphone did not start")
			await Bun.sleep(10)
		}
		recording.stop()
		recording.stop()
		expect((await state()).muted).toBe(false)
		expect(Array.from(await recording.result)).toEqual([0.5])
	} finally {
		recording.stop()
		await recording.result.catch(() => {})
	}
})
