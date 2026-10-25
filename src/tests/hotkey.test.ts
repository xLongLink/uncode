import { expect, test } from "bun:test"
import { Hotkey, key, type InputEvent } from "../src/hotkey.ts"

function scenario(keys: number[][], keycode = key.copilot) {
	const events: InputEvent[] = []
	const actions: string[] = []
	const hotkey = new Hotkey(
		events.push.bind(events),
		() => actions.push("start"),
		() => actions.push("stop"),
		keycode,
	)
	keys.forEach(([code, value]) => hotkey.feed({ type: 1, code, value }))
	return { events, actions, hotkey }
}

test.each([30, 58, key.shift, key.super, key.insert])(
	"selected key %i records without forwarding its presses or repeats",
	(keycode) => {
		const result = scenario(
			[
				[keycode, 1],
				[keycode, 2],
				[keycode, 0],
			],
			keycode,
		)
		expect(result.actions).toEqual(["start", "stop"])
		expect(result.events).toEqual([])
		expect(result.hotkey.pressed.size).toBe(0)
	},
)

test("custom hotkey preserves modifiers and forwards Copilot normally", () => {
	const keys = [
		[key.shift, 1],
		[key.super, 1],
		[30, 1],
		[key.copilot, 1],
		[key.copilot, 0],
		[30, 0],
		[key.super, 0],
		[key.shift, 0],
	]
	const result = scenario(keys, 30)
	expect(result.actions).toEqual(["start", "stop"])
	expect(result.events.map((event) => [event.code, event.value])).toEqual(
		keys.filter(([code]) => code !== 30),
	)
})

test("custom hotkey recovers a missed release from physical key state", () => {
	const result = scenario([[58, 1]], 58)
	result.hotkey.reconcile(new Set())
	expect(result.actions).toEqual(["start", "stop"])
	expect(result.hotkey.pressed.has(58)).toBe(false)
	expect(result.events).toEqual([{ type: 0, code: 0, value: 0 }])
})

test("Copilot chord is hidden; recording lasts until F23 release", () => {
	const result = scenario([
		[key.super, 1],
		[key.shift, 1],
		[key.copilot, 1],
		[key.copilot, 0],
		[key.shift, 0],
		[key.super, 0],
	])
	expect(result.actions).toEqual(["start", "stop"])
	expect(result.events).toEqual([])
	expect(result.hotkey.pressed.size).toBe(0)
})

test("bare F23 works and repeated keydown does not restart recording", () => {
	const result = scenario([
		[key.copilot, 1],
		[key.copilot, 2],
		[key.copilot, 2],
		[key.copilot, 0],
	])
	expect(result.actions).toEqual(["start", "stop"])
	expect(result.events).toEqual([])
})

test("orphan hotkey releases and repeats do not start or stop recording", () => {
	const result = scenario([
		[key.copilot, 0],
		[key.copilot, 2],
		[key.copilot, 0],
	])
	expect(result.actions).toEqual([])
	expect(result.events).toEqual([])
	expect(result.hotkey.pressed.size).toBe(0)
})

test("duplicate keydown starts once and only a held hotkey release stops recording", () => {
	const result = scenario([
		[key.copilot, 1],
		[key.copilot, 1],
	])
	expect(result.actions).toEqual(["start"])
	expect(result.hotkey.pressed.has(key.copilot)).toBe(true)
	result.hotkey.feed({ type: 1, code: key.copilot, value: 0 })
	result.hotkey.feed({ type: 1, code: key.copilot, value: 0 })
	expect(result.actions).toEqual(["start", "stop"])
	expect(result.events).toEqual([])
	expect(result.hotkey.pressed.size).toBe(0)
})

test("normal modifier shortcuts are forwarded in order", () => {
	const keys = [
		[key.super, 1],
		[key.shift, 1],
		[30, 1],
		[30, 0],
		[key.shift, 0],
		[key.super, 0],
	]
	const result = scenario(keys)
	expect(result.events.map((event) => [event.code, event.value])).toEqual(keys)
	expect(result.actions).toEqual([])
})

test("modifier tap is preserved", () => {
	expect(
		scenario([
			[key.super, 1],
			[key.super, 0],
		]).events.map((event) => event.value),
	).toEqual([1, 0])
})

test("other keys remain usable while recording", () => {
	const result = scenario([
		[key.copilot, 1],
		[48, 1],
		[48, 0],
		[key.copilot, 0],
	])
	expect(result.events.map((event) => event.code)).toEqual([48, 48])
	expect(result.actions).toEqual(["start", "stop"])
})

test("scan codes are hidden but synchronization is forwarded", () => {
	const result = scenario([])
	result.hotkey.feed({ type: 4, code: 4, value: 0x6e })
	result.hotkey.feed({ type: 0, code: 0, value: 0 })
	expect(result.events).toEqual([{ type: 0, code: 0, value: 0 }])
})

test("releasing modifiers first does not stop recording early", () => {
	const result = scenario([
		[key.shift, 1],
		[key.super, 1],
		[key.copilot, 1],
		[key.shift, 0],
		[key.super, 0],
	])
	expect(result.actions).toEqual(["start"])
	result.hotkey.feed({ type: 1, code: key.copilot, value: 0 })
	expect(result.actions).toEqual(["start", "stop"])
	expect(result.events).toEqual([])
})

test("physical key state recovers a missed Copilot and modifier release", () => {
	const result = scenario([
		[key.shift, 1],
		[key.super, 1],
		[key.copilot, 1],
	])
	result.hotkey.reconcile(new Set())
	expect(result.actions).toEqual(["start", "stop"])
	expect(result.hotkey.pressed.size).toBe(0)
	expect(result.hotkey.hidden.size).toBe(0)
})

test("physical key checks never release a key that is still held", () => {
	const result = scenario([[key.copilot, 1]])
	result.hotkey.reconcile(new Set([key.copilot]))
	expect(result.actions).toEqual(["start"])
	expect(result.hotkey.pressed.has(key.copilot)).toBe(true)
})

test("a missed ordinary key release is forwarded with synchronization", () => {
	const result = scenario([[30, 1]])
	result.hotkey.reconcile(new Set())
	expect(result.events).toEqual([
		{ type: 1, code: 30, value: 1 },
		{ type: 1, code: 30, value: 0 },
		{ type: 0, code: 0, value: 0 },
	])
})

test("dropped keyboard events are ignored until synchronization, then releases recover", () => {
	const result = scenario([[key.copilot, 1]])
	result.hotkey.feed({ type: 0, code: 3, value: 0 })
	result.hotkey.feed({ type: 1, code: 30, value: 1 })
	result.hotkey.reconcile(new Set())
	expect(result.actions).toEqual(["start"])
	expect(result.events).toEqual([])
	result.hotkey.feed({ type: 0, code: 0, value: 0 })
	result.hotkey.reconcile(new Set())
	expect(result.actions).toEqual(["start", "stop"])
	expect(result.hotkey.pressed.size).toBe(0)
})
