import { dlopen, ptr } from "bun:ffi"
import { parentPort, workerData } from "node:worker_threads"

// Whistle is process-global and not thread-safe. This single worker owns all calls
// so native inference never blocks the keyboard relay on the main thread.
const library = dlopen(workerData.library, {
	needle_load: { args: ["ptr", "u64"], returns: "i32" },
	needle_transcribe: {
		args: ["ptr", "i32", "ptr", "ptr", "i32", "ptr", "i32"],
		returns: "i32",
	},
	needle_last_error: { args: [], returns: "cstring" },
})
const model = new Uint8Array(await Bun.file(workerData.model).arrayBuffer())
if (library.symbols.needle_load(ptr(model), model.byteLength) < 0)
	throw new Error(library.symbols.needle_last_error()?.toString() ?? "Whistle model load failed")
const output = Buffer.alloc(262144)
if (!parentPort) throw new Error("Transcription must run in a worker")
const port = parentPort

port.on("message", ({ audio }: { audio: Float32Array }) => {
	try {
		if (
			library.symbols.needle_transcribe(
				audio.length ? ptr(audio) : null,
				audio.length,
				null,
				null,
				0,
				ptr(output),
				output.length,
			) < 0
		)
			throw new Error(
				library.symbols.needle_last_error()?.toString() ?? "Whistle transcription failed",
			)
		port.postMessage(JSON.parse(output.toString("utf8", 0, output.indexOf(0))))
	} catch (error) {
		port.postMessage({
			error: error instanceof Error ? error.message : String(error),
		})
	}
})
port.postMessage("ready")
