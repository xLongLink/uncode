function wpctl(...args: string[]) {
	const result = Bun.spawnSync(["wpctl", ...args], {
		stdout: "pipe",
		stderr: "pipe",
		timeout: 2000,
		env: process.env,
	})
	if (result.exitCode !== 0)
		throw new Error(result.stderr.toString().trim() || `wpctl exited with ${result.exitCode}`)
	return result.stdout.toString().trim()
}

export function muteOutput() {
	try {
		// Save the actual sink, so a default-device change cannot unmute another one.
		const id = /^id (\d+),/m.exec(wpctl("inspect", "@DEFAULT_AUDIO_SINK@"))?.[1]
		if (!id) throw new Error("Could not identify the default audio output")
		const volume = wpctl("get-volume", id)
		if (!/^Volume: \d+(?:\.\d+)?(?: \[MUTED\])?$/.test(volume))
			throw new Error("Could not read the audio output mute state")
		if (volume.endsWith("[MUTED]")) return () => {}
		wpctl("set-mute", id, "1")
		let restored = false
		return () => {
			if (restored) return
			try {
				wpctl("set-mute", id, "0")
				restored = true
			} catch (error) {
				console.warn(
					`Could not restore system audio: ${error instanceof Error ? error.message : String(error)}`,
				)
			}
		}
	} catch (error) {
		console.warn(
			`Could not mute system audio: ${error instanceof Error ? error.message : String(error)}`,
		)
		return () => {}
	}
}
