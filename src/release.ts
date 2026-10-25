import { mkdir, mkdtemp, rename, rm } from "node:fs/promises"
import { basename, join, resolve } from "node:path"

export async function buildRelease(version: string, output: string, arch: string = process.arch) {
	if (
		!/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(
			version,
		)
	)
		throw new Error("Version must be a tag such as v1.2.3 or v1.2.3-rc.1")
	if (arch !== "x64" && arch !== "arm64") throw new Error("Architecture must be x64 or arm64")
	const destination = resolve(output)
	await mkdir(destination, { recursive: true })
	const staging = await mkdtemp(join(destination, ".release-"))
	const executable = join(destination, `uncode-linux-${arch}`)
	const staged = join(staging, basename(executable))
	try {
		const result = await Bun.build({
			entrypoints: [
				join(import.meta.dir, "src/cli.ts"),
				join(import.meta.dir, "src/transcribe.ts"),
			],
			compile: {
				target: `bun-linux-${arch}`,
				outfile: staged,
				autoloadDotenv: false,
				autoloadBunfig: false,
			},
			define: { UNCODE_VERSION: JSON.stringify(version) },
			minify: true,
		})
		if (!result.success) throw new AggregateError(result.logs, "Executable compilation failed")
		const digest = new Bun.CryptoHasher("sha256")
			.update(await Bun.file(staged).arrayBuffer())
			.digest("hex")
		await rename(staged, executable)
		await Bun.write(`${executable}.sha256`, `${digest}  ${basename(executable)}\n`)
		const script = (
			await Bun.file(join(import.meta.dir, "install-release.sh")).text()
		).replaceAll("@VERSION@", version)
		for (const action of ["install", "uninstall"]) {
			await Bun.write(
				join(destination, `${action}.sh`),
				script.replaceAll("@ACTION@", action),
			)
		}
		return executable
	} finally {
		await rm(staging, { recursive: true, force: true })
	}
}

if (import.meta.main) {
	const [version = "v0.0.0-dev", output = "dist", arch = process.arch, ...extra] =
		process.argv.slice(2)
	if (extra.length) throw new Error("Usage: release.ts [vX.Y.Z] [output-directory] [x64|arm64]")
	console.info(await buildRelease(version, output, arch))
}
