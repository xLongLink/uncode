import { afterEach, beforeEach, expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rm, readdir } from "node:fs/promises"
import { join } from "node:path"

let directory: string
let env: NodeJS.ProcessEnv
let script: string

beforeEach(async () => {
	await mkdir("/tmp/opencode", { recursive: true })
	directory = await mkdtemp("/tmp/opencode/bootstrap-tests-")
	const tools = join(directory, "tools")
	const assets = join(directory, "assets")
	await mkdir(tools)
	await mkdir(assets)
	await mkdir(join(directory, "tmp"))
	script = (await Bun.file(join(import.meta.dir, "../install-release.sh")).text()).replaceAll(
		"@VERSION@",
		"v1.2.3",
	)
	await Bun.write(
		join(tools, "uname"),
		'#!/bin/sh\nif [ "$1" = -s ]; then echo Linux; else echo "$TEST_ARCH"; fi\n',
	)
	await Bun.write(
		join(tools, "curl"),
		`#!/bin/bash
set -eu
while (( $# )); do
    case "$1" in
        --output) output="$2"; shift 2 ;;
        https://*) url="$1"; shift ;;
        *) shift ;;
    esac
done
file="\${url##*/}"
if [[ "\${TEST_FAIL_DOWNLOAD:-}" == "$file" ]]; then exit 22; fi
cp "$TEST_ASSETS/$file" "$output"
`,
	)
	for (const command of ["uname", "curl"]) await chmod(join(tools, command), 0o755)
	for (const arch of ["x64", "arm64"]) {
		const name = `uncode-linux-${arch}`
		const binary = '#!/bin/sh\nprintf "%s\\n" "$@" > "$TEST_LOG"\n'
		await Bun.write(join(assets, name), binary)
		const digest = new Bun.CryptoHasher("sha256").update(binary).digest("hex")
		await Bun.write(join(assets, `${name}.sha256`), `${digest}  ${name}\n`)
	}
	env = {
		...process.env,
		PATH: `${tools}:${process.env.PATH}`,
		TMPDIR: join(directory, "tmp"),
		XDG_SESSION_TYPE: "wayland",
		TEST_ARCH: "x86_64",
		TEST_ASSETS: assets,
		TEST_LOG: join(directory, "executed"),
		TEST_FAIL_DOWNLOAD: "",
	}
})

afterEach(async () => {
	await rm(directory, { recursive: true, force: true })
})

async function runInstaller() {
	const child = Bun.spawn(["bash"], {
		stdin: Buffer.from(script),
		env,
		stdout: "pipe",
		stderr: "pipe",
	})
	const [code, , stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	])
	expect(await readdir(join(directory, "tmp"))).toEqual([])
	return { code, stderr }
}

for (const arch of ["x86_64", "aarch64"]) {
	test(`curl installer selects ${arch}, verifies the binary, and runs install`, async () => {
		env.TEST_ARCH = arch
		expect((await runInstaller()).code).toBe(0)
		expect(await Bun.file(join(directory, "executed")).text()).toBe("install\n")
	})
}

test("curl installer rejects a corrupted binary without executing it", async () => {
	await Bun.write(join(directory, "assets/uncode-linux-x64"), "corrupted")
	expect((await runInstaller()).code).not.toBe(0)
	expect(await Bun.file(join(directory, "executed")).exists()).toBe(false)
})

test("curl installer rejects malformed checksum filenames", async () => {
	await Bun.write(
		join(directory, "assets/uncode-linux-x64.sha256"),
		`${"0".repeat(64)}  ../other\n`,
	)
	expect((await runInstaller()).stderr).toContain("Invalid release checksum")
	expect(await Bun.file(join(directory, "executed")).exists()).toBe(false)
})

test("curl installer stops when a download fails", async () => {
	env.TEST_FAIL_DOWNLOAD = "uncode-linux-x64.sha256"
	expect((await runInstaller()).code).toBe(22)
	expect(await Bun.file(join(directory, "executed")).exists()).toBe(false)
})

test("curl installer rejects unsupported architectures before downloading", async () => {
	env.TEST_ARCH = "riscv64"
	expect((await runInstaller()).stderr).toContain("Unsupported architecture")
	expect(await Bun.file(join(directory, "executed")).exists()).toBe(false)
})
