const result = await Bun.build({
	entrypoints: [
		"./check.ts",
		"./release.ts",
		"./src/voice.ts",
		"./src/cli.ts",
		"./src/setup.ts",
		"./src/transcribe.ts",
	],
	target: "bun",
})
if (!result.success) {
	console.error(result.logs)
	process.exit(1)
}
if (
	Bun.spawnSync(["bash", "-n", "setup.sh", "install-release.sh"], {
		stdout: "inherit",
		stderr: "inherit",
	}).exitCode !== 0
)
	process.exit(1)
const tests = Bun.spawn([process.execPath, "test"], { stdout: "inherit", stderr: "inherit" })
if ((await tests.exited) !== 0) process.exit(1)
