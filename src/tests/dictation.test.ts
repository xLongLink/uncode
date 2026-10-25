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

test("allows only one operation until its transcript has pasted", async () => {
	const first = deferred<string>()
	const started = deferred<void>()
	const calls: number[] = []
	const context = session(async (audio) => {
		calls.push(audio[0])
		started.resolve(undefined)
		return audio[0] === 1 ? first.promise : "second"
	})
	context.press()
	context.release()
	context.press()
	context.release()
	expect(context.captures).toHaveLength(1)
	context.captures[0].resolve(new Float32Array([1]))
	await started.promise
	context.press()
	context.release()
	expect(context.captures).toHaveLength(1)
	expect(calls).toEqual([1])
	first.resolve("first")
	await context.dictation.processing
	context.press()
	context.release()
	expect(context.captures).toHaveLength(1)
	context.dictation.flush(false)
	expect(context.pasted).toEqual(["first"])
	context.press()
	context.release()
	expect(context.captures).toHaveLength(2)
	context.captures[1].resolve(new Float32Array([2]))
	await context.dictation.processing
	context.dictation.flush(false)
	expect(calls).toEqual([1, 2])
	expect(context.pasted).toEqual(["first", "second"])
})

test("paste waits for all keys to be released", async () => {
	const context = session()
	context.press()
	context.captures[0].resolve(new Float32Array([1]))
	await context.dictation.processing
	context.dictation.flush(context.hotkey.pressed.size > 0)
	expect(context.pasted).toEqual([])
	context.hotkey.feed({ type: 1, code: 30, value: 1 })
	context.release()
	context.dictation.flush(context.hotkey.pressed.size > 0)
	expect(context.pasted).toEqual([])
	context.hotkey.feed({ type: 1, code: 30, value: 0 })
	context.dictation.flush(false)
	expect(context.pasted).toEqual(["text1"])
})

test("a failed capture does not block the next dictation", async () => {
	const context = session()
	context.press()
	context.release()
	context.captures[0].reject(new Error("microphone unavailable"))
	await context.dictation.processing
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
		await context.dictation.processing
	}
	context.dictation.flush(false)
	expect(context.pasted).toEqual(["second"])
	expect(error).toHaveBeenCalledTimes(1)
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

test("clipboard failure retains the transcript and blocks new recordings until retry succeeds", async () => {
	let attempts = 0
	const context = session(undefined, () => {
		attempts++
		throw new Error("clipboard unavailable")
	})
	context.press()
	context.release()
	context.captures[0].resolve(new Float32Array([1]))
	await context.dictation.processing
	expect(() => context.dictation.flush(false)).not.toThrow()
	context.dictation.flush(false)
	expect(attempts).toBe(1)
	expect(error).toHaveBeenCalledTimes(1)
	context.press()
	context.release()
	expect(context.captures).toHaveLength(1)
	await Bun.sleep(1050)
	context.dictation.flush(true)
	expect(attempts).toBe(1)
	context.dictation.flush(false)
	expect(attempts).toBe(2)
	expect(error).toHaveBeenCalledTimes(1)
	context.dictation.paste = (text) => context.pasted.push(text)
	await Bun.sleep(1050)
	context.dictation.flush(false)
	expect(context.pasted).toEqual(["text1"])
	context.press()
	context.release()
	context.captures[1].resolve(new Float32Array([2]))
	await context.dictation.processing
	context.dictation.flush(false)
	expect(context.pasted).toEqual(["text1", "text2"])
	context.dictation.paste = () => {
		throw new Error("clipboard unavailable again")
	}
	context.press()
	context.release()
	context.captures[2].resolve(new Float32Array([3]))
	await context.dictation.processing
	context.dictation.flush(false)
	expect(error).toHaveBeenCalledTimes(2)
})

test("empty recordings and empty transcripts release the operation without pasting", async () => {
	const calls: number[] = []
	const context = session(async (audio) => {
		calls.push(audio[0])
		return ""
	})
	for (const audio of [new Float32Array(), new Float32Array([1])]) {
		context.press()
		context.release()
		context.captures.at(-1)!.resolve(audio)
		await context.dictation.processing
		context.dictation.flush(false)
	}
	expect(context.captures).toHaveLength(2)
	expect(calls).toEqual([1])
	expect(context.pasted).toEqual([])
})

test("shutdown stops a pending microphone and ignores its eventual audio", async () => {
	const calls: number[] = []
	const context = session(async (audio) => {
		calls.push(audio[0])
		return "unexpected"
	})
	context.press()
	context.dictation.close()
	expect(context.captures[0].stopped).toBe(true)
	context.captures[0].resolve(new Float32Array([1]))
	await context.dictation.processing
	context.dictation.flush(false)
	expect(calls).toEqual([])
	expect(context.pasted).toEqual([])
})

test("shutdown does not paste an in-flight transcription", async () => {
	const transcript = deferred<string>()
	const started = deferred<void>()
	const context = session(async () => {
		started.resolve(undefined)
		return transcript.promise
	})
	context.press()
	context.release()
	context.captures[0].resolve(new Float32Array([1]))
	await started.promise
	context.dictation.close()
	transcript.resolve("discarded")
	await context.dictation.processing
	context.dictation.flush(false)
	expect(context.pasted).toEqual([])
})

test("shutdown handles a pending capture rejection", async () => {
	const context = session()
	context.press()
	context.dictation.close()
	context.captures[0].reject(new Error("recorder stopped"))
	await context.dictation.processing
	context.dictation.flush(false)
	expect(context.pasted).toEqual([])
	expect(error).toHaveBeenCalledTimes(1)
})

test("shutdown discards a transcript waiting for clipboard retry", async () => {
	const context = session(undefined, () => {
		throw new Error("clipboard unavailable")
	})
	context.press()
	context.release()
	context.captures[0].resolve(new Float32Array([1]))
	await context.dictation.processing
	context.dictation.flush(false)
	context.dictation.close()
	context.dictation.paste = (text) => context.pasted.push(text)
	context.dictation.retryAt = 0
	context.dictation.flush(false)
	expect(context.pasted).toEqual([])
})
