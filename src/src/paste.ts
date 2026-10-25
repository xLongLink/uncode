import { key, type InputEvent } from "./hotkey.ts"

export function pasteText(text: string, emit: (event: InputEvent) => void) {
	const started = performance.now()
	// Clipboard is required; primary selection is optional on some compositors.
	for (const selection of [[], ["--primary"]]) {
		const result = Bun.spawnSync(
			["wl-copy", ...selection, "--type", "text/plain;charset=utf-8"],
			{
				stdin: Buffer.from(text),
				stdout: "ignore",
				// wl-copy's clipboard owner inherits stderr; do not wait for its pipe.
				stderr: "ignore",
				timeout: 5000,
				env: process.env,
			},
		)
		if (result.exitCode === 0) continue
		if (!selection.length) throw new Error(`Clipboard copy failed: exit ${result.exitCode}`)
		console.warn(`Primary selection unavailable: exit ${result.exitCode}; using clipboard only`)
	}
	for (const value of [1, 0]) {
		for (const code of value ? [key.shift, key.insert] : [key.insert, key.shift])
			emit({ type: 1, code, value })
		emit({ type: 0, code: 0, value: 0 })
	}
	console.info(`Clipboard/paste: ${Math.round(performance.now() - started)} ms`)
}
