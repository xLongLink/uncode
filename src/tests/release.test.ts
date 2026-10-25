import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import { basename, join } from "node:path"
import { buildRelease } from "../release.ts"
import { encodeEvent } from "../src/keyboard.ts"

test("compiled release works without Bun, source files, or the working directory", async () => {
	await mkdir("/tmp/opencode", { recursive: true })
	const directory = await mkdtemp("/tmp/opencode/release-tests-")
	try {
		const executable = await buildRelease("v1.2.3-rc.1", directory)
		const installer = await Bun.file(join(directory, "install.sh")).text()
		expect(installer).toContain("version='v1.2.3-rc.1'")
		expect(installer).not.toContain("@VERSION@")
		expect(installer).toContain("action='install'")
		const uninstaller = await Bun.file(join(directory, "uninstall.sh")).text()
		expect(uninstaller).toContain("version='v1.2.3-rc.1'")
		expect(uninstaller).toContain("action='uninstall'")
		expect(uninstaller).not.toContain("@VERSION@")
		expect(uninstaller).not.toContain("@ACTION@")
		expect(basename(executable)).toBe(`uncode-linux-${process.arch}`)
		const env = { ...process.env, PATH: "", BUN_BE_BUN: undefined }
		const run = (...args: string[]) =>
			Bun.spawnSync([executable, ...args], {
				cwd: "/tmp/opencode",
				env,
			})
		const version = run("--version")
		expect(version.exitCode).toBe(0)
		expect(version.stdout.toString().trim()).toBe("v1.2.3-rc.1")
		expect(run("--help").stdout.toString()).toContain("install|uninstall|start")
		expect(run("invalid").exitCode).toBe(1)
		expect(run("install", "unexpected").exitCode).toBe(1)
		const licenses = run("licenses")
		expect(licenses.exitCode).toBe(0)
		expect(licenses.stdout.toString()).toContain("Apache License")
		expect(licenses.stdout.toString()).toContain(
			"b6e02f048568ac5d01a2042556c658061e699acbc0aa2a1439f52f3d461dffeb",
		)
		const checksum = Bun.spawnSync(["sha256sum", "-c", `${executable}.sha256`], {
			cwd: directory,
		})
		expect(checksum.exitCode).toBe(0)
		const config = join(directory, "config/voice.json")
		const unit = join(directory, "systemd/uncode-voice.service")
		const keyboard = "/dev/input/by-id/copilot-event-kbd"
		const device = join(directory, "keyboard-events")
		await Bun.write(device, encodeEvent({ type: 1, code: 58, value: 1 }))
		const detected = run("setup", "detect", device)
		expect(detected.exitCode).toBe(0)
		expect(detected.stdout.toString().trim()).toBe(`${device}\t58`)
		expect(detected.stderr.toString()).toContain("Press the key you want")
		const configure = run("setup", "configure", keyboard, config, unit, "58")
		expect(configure.exitCode).toBe(0)
		expect(await Bun.file(config).json()).toEqual({ keyboard, keycode: 58, language: null })
		const service = await Bun.file(unit).text()
		expect(service).toContain(`ExecStart="${executable}" "start"`)
		expect(service).not.toContain(".ts")
		expect(run("setup", "configure").exitCode).not.toBe(0)
		const install = Bun.spawnSync([executable, "install"], {
			env: { ...env, XDG_SESSION_TYPE: "x11", XDG_DATA_HOME: join(directory, "data") },
		})
		expect(install.exitCode).not.toBe(0)
		expect(install.stderr.toString()).toMatch(/desktop user|Wayland desktop/)
		expect(await Bun.file(join(directory, "data/uncode/releases")).exists()).toBe(false)
		if (process.getuid?.() !== 0) {
			const tools = join(directory, "tools")
			await mkdir(tools)
			for (const command of ["bash", "dirname", "rm"]) {
				const path = Bun.which(command)
				if (!path) throw new Error(`Missing test command: ${command}`)
				await symlink(path, join(tools, command))
			}
			for (const command of ["apt-get", "systemctl", "sudo"]) {
				await Bun.write(
					join(tools, command),
					`#!/bin/sh\nexit ${command === "sudo" ? 19 : 0}\n`,
				)
				await chmod(join(tools, command), 0o755)
			}
			const data = join(directory, "data with spaces $value %name 'quote")
			const configHome = join(directory, "desktop-config")
			const installerEnv = {
				...env,
				PATH: tools,
				XDG_SESSION_TYPE: "wayland",
				XDG_DATA_HOME: data,
				XDG_CONFIG_HOME: configHome,
			}
			await Bun.write(join(data, "unrelated.txt"), "keep")
			const failed = Bun.spawnSync([executable, "install"], { env: installerEnv })
			expect(failed.exitCode).toBe(19)
			expect(failed.stdout.toString()).toContain("Installed executable:")
			expect(await Bun.file(join(data, "unrelated.txt")).text()).toBe("keep")
			const copies = [...new Bun.Glob("uncode/releases/voice-*/uncode").scanSync(data)]
			expect(copies).toHaveLength(1)
			const installed = join(data, copies[0])
			const installedVersion = Bun.spawnSync([installed, "--version"], { env })
			expect(installedVersion.exitCode).toBe(0)
			expect(installedVersion.stdout.toString().trim()).toBe("v1.2.3-rc.1")
			const installedUnit = join(configHome, "systemd/user/uncode-voice.service")
			const installedConfig = join(configHome, "uncode-voice.json")
			expect(
				Bun.spawnSync(
					[
						installed,
						"setup",
						"configure",
						keyboard,
						installedConfig,
						installedUnit,
						"58",
					],
					{ env },
				).exitCode,
			).toBe(0)
			expect(await Bun.file(installedUnit).text()).toContain(
				`ExecStart="${directory}/data with spaces $$value %%name 'quote/uncode/releases/`,
			)
			await Bun.write(join(tools, "sudo"), "#!/bin/sh\nexit 0\n")
			const uninstallCommand = failed.stdout
				.toString()
				.split("\n")
				.find((line) => line.startsWith("To uninstall: "))
			if (!uninstallCommand) throw new Error("Installer did not print an uninstall command")
			const uninstall = Bun.spawnSync(
				["bash", "-c", uninstallCommand.slice("To uninstall: ".length)],
				{ env: installerEnv },
			)
			expect(uninstall.exitCode).toBe(0)
			expect(await Bun.file(installedUnit).exists()).toBe(false)
			expect(await Bun.file(installedConfig).exists()).toBe(false)
			expect(await Bun.file(join(data, "unrelated.txt")).text()).toBe("keep")
		}
		if (process.env.VOICE_NATIVE_TEST === "1") {
			const cache = join(directory, "cache")
			await mkdir(cache)
			await symlink(join(import.meta.dir, "../.cache"), join(cache, "uncode"))
			const native = Bun.spawn([executable, "setup", "download"], {
				cwd: "/tmp/opencode",
				env: { ...process.env, XDG_CACHE_HOME: cache, BUN_BE_BUN: undefined },
				stdout: "inherit",
				stderr: "inherit",
			})
			expect(await native.exited).toBe(0)
		}
		await expect(buildRelease("../bad", directory)).rejects.toThrow("Version")
		await expect(buildRelease("v1.2.3", directory, "ia32")).rejects.toThrow("Architecture")
	} finally {
		await rm(directory, { recursive: true, force: true })
	}
}, 120000)
