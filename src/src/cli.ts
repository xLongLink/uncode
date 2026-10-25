import { chmod, mkdir, mkdtemp, copyFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import setup from "../setup.sh" with { type: "text" }
import license from "../LICENSE" with { type: "text" }
import modelLicense from "../models/LICENSE" with { type: "text" }
import modelProvenance from "../models/README.md" with { type: "text" }
import { runSetup } from "./setup.ts"

declare const UNCODE_VERSION: string
const version = typeof UNCODE_VERSION === "string" ? UNCODE_VERSION : "development"
const [action, ...args] = process.argv.slice(2)

if (action === "setup") {
	await runSetup(args[0], args.slice(1))
} else if (action === "start" && !args.length) {
	await import("./voice.ts")
} else if ((action === "install" || action === "uninstall") && !args.length) {
	if (process.platform !== "linux" || !["x64", "arm64"].includes(process.arch))
		throw new Error("Uncode supports Ubuntu/Debian on x86_64 or ARM64")
	if (process.getuid?.() === 0)
		throw new Error("Run as your desktop user, not root; sudo is used only for system setup")
	if (action === "install" && process.env.XDG_SESSION_TYPE !== "wayland")
		throw new Error("Install from a terminal in your Wayland desktop session")
	let executable = process.execPath
	if (action === "install" && Bun.isStandaloneExecutable) {
		const base = join(
			process.env.XDG_DATA_HOME ?? join(homedir(), ".local/share"),
			"uncode/releases",
		)
		await mkdir(base, { recursive: true })
		const directory = await mkdtemp(join(base, `voice-${version}-`))
		executable = join(directory, "uncode")
		await copyFile(process.execPath, executable)
		await chmod(executable, 0o755)
		console.info(`Installed executable: ${executable}`)
		console.info(`To uninstall: '${executable.replaceAll("'", "'\\''")}' uninstall`)
	}
	const runner = Bun.isStandaloneExecutable ? [executable] : [executable, import.meta.path]
	const child = Bun.spawn(["bash", "-c", setup, "uncode-setup", action, ...runner], {
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
	})
	process.exitCode = await child.exited
} else if (action === "--version" && !args.length) {
	console.info(version)
} else if (action === "licenses" && !args.length) {
	console.info(`Uncode\n${license}\nSpeech model\n${modelLicense}\n${modelProvenance}`)
} else {
	console.info("Usage: uncode <install|uninstall|start|licenses|--version|--help>")
	if (action && action !== "--help") process.exitCode = 1
	if (args.length) process.exitCode = 1
}
