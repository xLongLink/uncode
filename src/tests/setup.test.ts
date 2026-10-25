import { expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { runSetup } from "../src/setup.ts"

test("source setup creates a service using Bun and the CLI entrypoint", async () => {
	await mkdir("/tmp/opencode", { recursive: true })
	const directory = await mkdtemp("/tmp/opencode/setup-tests-")
	try {
		const config = join(directory, "config/voice.json")
		const unit = join(directory, "systemd/voice.service")
		await runSetup("configure", ["/dev/input/by-id/copilot-event-kbd", config, unit])
		const service = await Bun.file(unit).text()
		expect(service).toContain(process.execPath)
		expect(service).toContain('cli.ts" "start"')
		expect((await Bun.file(config).json()).language).toBe(null)
		await expect(runSetup("invalid", [])).rejects.toThrow("Invalid")
		await expect(runSetup("configure", [])).rejects.toThrow("Invalid")
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
})
