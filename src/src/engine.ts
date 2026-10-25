import { once } from "node:events"
import { mkdir, rename } from "node:fs/promises"
import { dirname, join } from "node:path"
import { homedir } from "node:os"
import { Worker } from "node:worker_threads"
import model from "../models/whistle.cact" with { type: "file" }

// The native library is distributed inside a wheel; only its .so is used.
// Pin the engine compatible with the bundled speech weights; no Python SDK or telemetry.
const engineRevision = "93e88ede867e4311c39151285e74df513e4b835b"
const modelRevision = "ca5287601bef25af26dcf2e1b2bdc0843a7c19e5"
const root = dirname(import.meta.dir)

export async function createEngine(
	directory = Bun.isStandaloneExecutable
		? join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "uncode")
		: join(root, ".cache"),
) {
	if (process.platform !== "linux" || !["x64", "arm64"].includes(process.arch))
		throw new Error("Native Whistle supports Ubuntu/Debian on x86_64 or ARM64")
	if (!(await Bun.file(model).exists())) throw new Error("Bundled Whistle model is missing")
	const arch = process.arch === "x64" ? "x86_64" : "aarch64"
	const wheel = `cactus_needle-3.3.1-py3-none-manylinux2014_${arch}.whl`
	const folder = join(directory, `${engineRevision}-${modelRevision}`)
	await mkdir(folder, { recursive: true })
	const wheelFile = join(folder, wheel)
	if (!(await Bun.file(wheelFile).exists())) {
		console.info(`Downloading ${wheel}`)
		const response = await fetch(
			`https://huggingface.co/Cactus-Compute/needle3/resolve/${engineRevision}/python/${wheel}`,
		)
		if (!response.ok) throw new Error(`Whistle download failed: HTTP ${response.status}`)
		const bytes = new Uint8Array(await response.arrayBuffer())
		if (!bytes.length) throw new Error(`Empty Whistle asset: ${wheel}`)
		await Bun.write(`${wheelFile}.${process.pid}.partial`, bytes)
		await rename(`${wheelFile}.${process.pid}.partial`, wheelFile)
	}
	const library = join(folder, `libneedle3-${arch}.so`)
	if (!(await Bun.file(library).exists())) {
		const child = Bun.spawn(["unzip", "-p", wheelFile, "needle/libneedle3.so"], {
			stdout: "pipe",
			stderr: "pipe",
		})
		const [bytes, error, code] = await Promise.all([
			new Response(child.stdout).arrayBuffer(),
			new Response(child.stderr).text(),
			child.exited,
		])
		if (code !== 0 || !bytes.byteLength)
			throw new Error(
				`Unable to extract native Whistle library: ${error.trim() || `exit ${code}`}`,
			)
		await Bun.write(`${library}.${process.pid}.partial`, bytes)
		await rename(`${library}.${process.pid}.partial`, library)
	}
	const worker = new Worker(new URL("./transcribe.ts", import.meta.url), {
		workerData: { library, model },
	})
	await once(worker, "message").catch(async (error) => {
		await worker.terminate()
		throw error
	})
	return {
		async transcribe(audio: Float32Array, language: string | null = null) {
			const result = once(worker, "message")
			worker.postMessage({ audio, language })
			const [response] = await result
			if (response.error) throw new Error(response.error)
			if (typeof response.text !== "string")
				throw new Error("Whistle returned an invalid transcript")
			return response.text.trim()
		},
		close: () => worker.terminate(),
	}
}
