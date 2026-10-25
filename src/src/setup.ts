import { mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { createEngine } from "./engine.ts"
import { detectKeyboard } from "./detect-keyboard.ts"
import { openKeyboard } from "./keyboard.ts"

export async function runSetup(action: string, args: string[]) {
	if (action === "download" && !args.length) {
		const engine = await createEngine()
		try {
			if ((await engine.transcribe(new Float32Array(16000))) !== "")
				throw new Error("Whistle silence self-test failed")
		} finally {
			await engine.close()
		}
		console.info("Whistle ready (TypeScript + native CPU engine)")
		return
	}
	if (action === "check" && args.length === 1) {
		openKeyboard(args[0], true)
		return
	}
	if (action === "detect" && args.length) {
		console.error(
			"Press the Copilot key on the keyboard you want to use (within 30 seconds)...",
		)
		console.info(await detectKeyboard(args))
		return
	}
	if (action !== "configure" || args.length !== 3) throw new Error("Invalid voice setup command")
	const [keyboard, config, unit] = args
	const quote = (value: string) =>
		`"${value
			.replaceAll("\\", "\\\\")
			.replaceAll('"', '\\"')
			.replaceAll("\n", "\\n")
			.replaceAll("\r", "\\r")
			.replaceAll("%", "%%")
			.replaceAll("$", () => "$$")}"`
	const command = [process.execPath]
	if (!Bun.isStandaloneExecutable) command.push(join(import.meta.dir, "cli.ts"))
	command.push("start")
	await mkdir(dirname(config), { recursive: true })
	await mkdir(dirname(unit), { recursive: true })
	await Bun.write(config, JSON.stringify({ keyboard, language: null }, null, 2) + "\n")
	await Bun.write(
		unit,
		`[Unit]
Description=Local Whistle Copilot-key dictation
PartOf=graphical-session.target
After=graphical-session.target

[Service]
ExecStart=${command.map(quote).join(" ")}
Restart=on-failure
RestartSec=3

[Install]
WantedBy=graphical-session.target
`,
	)
}
