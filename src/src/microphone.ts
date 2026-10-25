import { spawn } from "node:child_process"
import { muteOutput } from "./output.ts"

export function decodePCM(bytes: Buffer) {
	return Float32Array.from(
		{ length: Math.floor(bytes.length / 2) },
		(_, index) => bytes.readInt16LE(index * 2) / 32768,
	)
}

export function captureAudio() {
	const restore = muteOutput()
	try {
		const recording = captureMicrophone()
		return {
			result: recording.result.finally(restore),
			stop() {
				try {
					recording.stop()
				} finally {
					restore()
				}
			},
		}
	} catch (error) {
		restore()
		throw error
	}
}

function captureMicrophone() {
	const child = spawn(
		"pw-record",
		["--raw", "--format", "s16", "--rate", "16000", "--channels", "1", "-"],
		{
			stdio: ["ignore", "pipe", "pipe"],
		},
	)
	const chunks: Buffer[] = []
	const maxBytes = 16000 * 30 * 2
	let length = 0
	let stopped = false
	let closed = false
	let killTimer: ReturnType<typeof setTimeout> | undefined
	let stderr = ""
	const stop = () => {
		if (stopped || closed) return
		stopped = true
		child.kill("SIGINT")
		// PipeWire can hang during device changes; never leave dictation waiting forever.
		killTimer = setTimeout(() => child.kill("SIGKILL"), 1000)
	}
	const timer = setTimeout(stop, 30000)
	const result = new Promise<Float32Array>((resolve, reject) => {
		child.stdout.on("data", (chunk) => {
			const bytes = chunk.subarray(0, maxBytes - length)
			chunks.push(bytes)
			length += bytes.length
			if (length >= maxBytes) stop()
		})
		child.stderr.on("data", (chunk) => {
			stderr = (stderr + chunk.toString()).slice(-4000)
		})
		child.once("error", (error) => {
			closed = true
			clearTimeout(timer)
			clearTimeout(killTimer)
			reject(error)
		})
		child.once("close", (code, signal) => {
			closed = true
			clearTimeout(timer)
			clearTimeout(killTimer)
			if (!stopped && (code !== 0 || signal))
				return reject(
					new Error(`Microphone failed: ${stderr.trim() || signal || `exit ${code}`}`),
				)
			resolve(decodePCM(Buffer.concat(chunks, length)))
		})
	})
	return { result, stop }
}
