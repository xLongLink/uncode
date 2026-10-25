import { expect, test } from "bun:test"
import { Copilot, key, type InputEvent } from "../src/hotkey.ts"

function scenario(keys: number[][]) {
	const events: InputEvent[] = []
	const actions: string[] = []
	const hotkey = new Copilot(
		events.push.bind(events),
		() => actions.push("start"),
		() => actions.push("stop"),
	)
	keys.forEach(([code, value]) => hotkey.feed({ type: 1, code, value }))
	return { events, actions, hotkey }
}

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
	expect(result.hotkey.active).toBe(false)
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
