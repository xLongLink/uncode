import { expect, test } from "bun:test"
import { decodeEvents, encodeEvent } from "../src/keyboard.ts"
import { decodePCM } from "../src/microphone.ts"

test("Linux input events preserve key presses, repeats, releases and synchronization", () => {
	const events = [
		{ type: 1, code: 193, value: 1 },
		{ type: 1, code: 193, value: 2 },
		{ type: 1, code: 193, value: 0 },
		{ type: 0, code: 0, value: 0 },
	]
	expect(decodeEvents(Buffer.concat(events.map(encodeEvent)))).toEqual(events)
})

test("incomplete Linux input events are rejected", () => {
	expect(() => decodeEvents(Buffer.alloc(23))).toThrow("Incomplete Linux input event")
})

test("PCM16 is normalized to mono float samples for Whistle", () => {
	const bytes = Buffer.alloc(8)
	bytes.writeInt16LE(-32768, 0)
	bytes.writeInt16LE(0, 2)
	bytes.writeInt16LE(16384, 4)
	bytes.writeInt16LE(32767, 6)
	expect(Array.from(decodePCM(bytes))).toEqual([-1, 0, 0.5, 32767 / 32768])
})

test("an incomplete trailing audio sample is ignored", () => {
	expect(decodePCM(Buffer.from([0, 0, 1])).length).toBe(1)
})
