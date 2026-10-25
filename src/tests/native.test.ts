import { expect, test } from "bun:test"
import { createEngine } from "../src/engine.ts"

test("bundled Whistle model matches the pinned upstream weights", async () => {
	const model = await Bun.file(new URL("../models/whistle.cact", import.meta.url)).arrayBuffer()
	expect(new Bun.CryptoHasher("sha256").update(model).digest("hex")).toBe(
		"b6e02f048568ac5d01a2042556c658061e699acbc0aa2a1439f52f3d461dffeb",
	)
})

test.skipIf(process.env.VOICE_NATIVE_TEST !== "1")(
	"native Whistle loads and handles repeated transcription calls",
	async () => {
		const engine = await createEngine()
		try {
			expect(await engine.transcribe(new Float32Array(16000))).toBe("")
			expect(await engine.transcribe(new Float32Array(32000))).toBe("")
		} finally {
			await engine.close()
		}
	},
	120000,
)
