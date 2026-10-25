import { afterEach, beforeEach, expect, spyOn, test } from "bun:test"
import { Dictation } from "../src/dictation.ts"
import { Hotkey, key } from "../src/hotkey.ts"

let info: ReturnType<typeof spyOn<typeof console, "info">>
let error: ReturnType<typeof spyOn<typeof console, "error">>

beforeEach(() => {
	info = spyOn(console, "info").mockImplementation(() => {})
	error = spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
	info.mockRestore()
	error.mockRestore()
})

function deferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (reason: Error) => void
	const promise = new Promise<T>((yes, no) => {
		resolve = yes
		reject = no
	})
	return { promise, resolve, reject, stopped: false }
}

function session(
	transcribe: (audio: Float32Array) => Promise<string> = async (audio) => `text${audio[0]}`,
	paste?: (text: string) => void,
) {
	const captures: ReturnType<typeof deferred<Float32Array>>[] = []
	const pasted: string[] = []
	const dictation = new Dictation(
		() => {
			const capture = deferred<Float32Array>()
			capture.stopped = false
			captures.push(capture)
			return {
				result: capture.promise,
				stop: () => {
					capture.stopped = true
				},
			}
		},
		transcribe,
		paste ?? ((text) => pasted.push(text)),
	)
	const hotkey = new Hotkey(
		() => {},
		() => dictation.start(),
		() => dictation.stop(),
	)
	const press = () => hotkey.feed({ type: 1, code: key.copilot, value: 1 })
	const release = () => hotkey.feed({ type: 1, code: key.copilot, value: 0 })
	return { dictation, hotkey, captures, pasted, press, release }
}

test("accepts a second recording during transcription and transcribes serially", async () => {
	const first = deferred<string>()
	const calls: number[] = []
	const context = session(async (audio) => {
		calls.push(audio[0])
		return audio[0] === 1 ? first.promise : "second"
	})
	context.press()
	context.release()
	context.captures[0].resolve(new Float32Array([1]))
	await Bun.sleep(0)
	context.press()
	expect(context.captures).toHaveLength(2)
	context.release()
	context.captures[1].resolve(new Float32Array([2]))
	await Bun.sleep(0)
	expect(calls).toEqual([1])
	first.resolve("first")
	await context.dictation.processing
	context.dictation.flush(false)
	expect(calls).toEqual([1, 2])
	expect(context.pasted).toEqual(["first second"])
})

test("paste waits for all keys to be released", async () => {
	const context = session()
	context.press()
	context.captures[0].resolve(new Float32Array([1]))
	await context.dictation.processing
	context.dictation.flush(context.hotkey.pressed.size > 0)
	expect(context.pasted).toEqual([])
	context.release()
	context.dictation.flush(false)
	expect(context.pasted).toEqual(["text1"])
})

test("a failed capture does not block the next dictation", async () => {
	const context = session()
	context.press()
	context.release()
	context.captures[0].reject(new Error("microphone unavailable"))
	context.press()
	context.release()
	context.captures[1].resolve(new Float32Array([2]))
	await context.dictation.processing
	context.dictation.flush(false)
	expect(context.pasted).toEqual(["text2"])
	expect(error).toHaveBeenCalledTimes(1)
})

test("a transcription failure does not block the next dictation", async () => {
	const context = session(async (audio) => {
		if (audio[0] === 1) throw new Error("inference failed")
		return "second"
	})
	for (const value of [1, 2]) {
		context.press()
		context.release()
		context.captures[value - 1].resolve(new Float32Array([value]))
	}
	await context.dictation.processing
	context.dictation.flush(false)
	expect(context.pasted).toEqual(["second"])
})

test("synchronous capture failure allows a new attempt", async () => {
	const context = session()
	const capture = context.dictation.capture
	context.dictation.capture = () => {
		throw new Error("spawn failed")
	}
	context.press()
	context.release()
	context.dictation.capture = capture
	context.press()
	context.release()
	context.captures[0].resolve(new Float32Array([1]))
	await context.dictation.processing
	context.dictation.flush(false)
	expect(context.pasted).toEqual(["text1"])
})

test("clipboard failure does not crash or block later dictation", async () => {
	const context = session(undefined, () => {
		throw new Error("clipboard unavailable")
	})
	context.press()
	context.release()
	context.captures[0].resolve(new Float32Array([1]))
	await context.dictation.processing
	expect(() => context.dictation.flush(false)).not.toThrow()
	context.dictation.paste = (text) => context.pasted.push(text)
	context.dictation.retryAt = 0
	context.press()
	context.release()
	context.captures[1].resolve(new Float32Array([2]))
	await context.dictation.processing
	context.dictation.flush(false)
	expect(context.pasted).toEqual(["text1 text2"])
})

test("queue is bounded and shutdown stops the active microphone", async () => {
	const context = session()
	for (let index = 0; index < 3; index++) {
		context.press()
		context.release()
	}
	context.press()
	expect(context.captures).toHaveLength(3)
	context.release()
	context.captures.forEach((capture) => capture.resolve(new Float32Array()))
	await context.dictation.processing
	context.dictation.flush(false)
	context.press()
	context.dictation.close()
	expect(context.captures[3].stopped).toBe(true)
	context.captures[3].resolve(new Float32Array())
	await context.dictation.processing
})
