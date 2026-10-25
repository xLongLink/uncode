import { closeSync, constants, openSync, readSync, realpathSync } from "node:fs"
import { decodeEvents } from "./keyboard.ts"

export async function detectKeyboard(devices: string[], timeout = 30000) {
	const keyboards: { device: string; fd: number }[] = []
	const seen = new Set()
	try {
		for (const device of devices) {
			try {
				const resolved = realpathSync(device)
				if (seen.has(resolved)) continue
				const fd = openSync(device, constants.O_RDONLY | constants.O_NONBLOCK)
				keyboards.push({ device, fd })
				seen.add(resolved)
			} catch {
				// A keyboard may have been unplugged since setup listed it.
			}
		}
		if (!keyboards.length) throw new Error("No keyboard devices could be opened")
		const bytes = Buffer.alloc(24 * 64)
		const deadline = performance.now() + timeout
		while (performance.now() < deadline) {
			for (const { device, fd } of keyboards) {
				let length
				try {
					length = readSync(fd, bytes)
				} catch (error) {
					if (
						error instanceof Error &&
						"code" in error &&
						["EAGAIN", "EWOULDBLOCK", "ENODEV"].includes(String(error.code))
					)
						continue
					throw error
				}
				const events = decodeEvents(bytes.subarray(0, length))
				const press = events.find(
					(event) =>
						event.type === 1 && event.code > 0 && event.code < 768 && event.value === 1,
				)
				if (press) return { keyboard: device, keycode: press.code }
			}
			await Bun.sleep(10)
		}
		throw new Error(
			"No key press detected. Run installation again and press your preferred key",
		)
	} finally {
		keyboards.forEach(({ fd }) => closeSync(fd))
	}
}
