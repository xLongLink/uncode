import { dlopen, ptr } from "bun:ffi"
import { closeSync, constants, openSync, readSync, writeSync } from "node:fs"
import { key, type InputEvent } from "./hotkey.ts"

// Linux x86_64/aarch64 input_event: timeval (16), type (2), code (2), value (4).
export function decodeEvents(bytes: Buffer) {
	if (bytes.length % 24) throw new Error("Incomplete Linux input event")
	return Array.from({ length: bytes.length / 24 }, (_, index) => ({
		type: bytes.readUInt16LE(index * 24 + 16),
		code: bytes.readUInt16LE(index * 24 + 18),
		value: bytes.readInt32LE(index * 24 + 20),
	}))
}

export function encodeEvent(event: InputEvent) {
	const bytes = Buffer.alloc(24)
	bytes.writeUInt16LE(event.type, 16)
	bytes.writeUInt16LE(event.code, 18)
	bytes.writeInt32LE(event.value, 20)
	return bytes
}

export function openKeyboard(device: string, checkOnly?: false, keycode?: number): Keyboard
export function openKeyboard(device: string, checkOnly: true, keycode?: number): undefined
export function openKeyboard(device: string, checkOnly = false, keycode = key.copilot) {
	if (process.platform !== "linux" || !["x64", "arm64"].includes(process.arch))
		throw new Error("Voice supports 64-bit x86/ARM Linux only")
	const library = dlopen("libc.so.6", {
		ioctl: { args: ["i32", "u64", "u64"], returns: "i32" },
		poll: { args: ["ptr", "u64", "i32"], returns: "i32" },
	})
	const ioctl = (fd: number, request: number, argument = 0) => {
		if (library.symbols.ioctl(fd, request, argument) < 0)
			throw new Error(
				`Keyboard ioctl 0x${request.toString(16)} failed; check device permissions`,
			)
	}
	const keyboard = openSync(device, constants.O_RDONLY | constants.O_NONBLOCK)
	const output = openSync("/dev/uinput", constants.O_WRONLY | constants.O_NONBLOCK)
	const poll = Buffer.alloc(8)
	poll.writeInt32LE(keyboard)
	poll.writeInt16LE(1, 4)
	const bytes = Buffer.alloc(24 * 64)
	const codes = Buffer.alloc(96)
	// EVIOCGBIT(EV_KEY, 96): read this keyboard's advertised key bitmap.
	ioctl(keyboard, 0x80604521, ptr(codes))
	if (!(codes[keycode >> 3] & (1 << (keycode & 7))))
		throw new Error(`Selected keyboard does not advertise key code ${keycode}`)
	if (checkOnly) {
		closeSync(output)
		closeSync(keyboard)
		library.close()
		return
	}
	ioctl(output, 0x40045564, 1) // UI_SET_EVBIT(EV_KEY)
	codes[key.shift >> 3] |= 1 << (key.shift & 7)
	codes[key.insert >> 3] |= 1 << (key.insert & 7)
	Array.from({ length: codes.length * 8 }, (_, code) => code)
		.filter((code) => codes[code >> 3] & (1 << (code & 7)))
		.forEach((code) => ioctl(output, 0x40045565, code)) // UI_SET_KEYBIT
	const setup = Buffer.alloc(92)
	setup.writeUInt16LE(3) // BUS_USB
	setup.writeUInt16LE(1, 2)
	setup.writeUInt16LE(1, 4)
	setup.writeUInt16LE(1, 6)
	setup.write("uncode-voice-keyboard", 8)
	ioctl(output, 0x405c5503, ptr(setup)) // UI_DEV_SETUP
	ioctl(output, 0x5501) // UI_DEV_CREATE
	return {
		grab() {
			ioctl(keyboard, 0x40044590, 1) // EVIOCGRAB
		},
		read() {
			const ready = library.symbols.poll(ptr(poll), 1, 0)
			if (ready < 0 || poll.readInt16LE(6) & (8 | 16 | 32))
				throw new Error("Keyboard disconnected or polling failed")
			if (!ready) return []
			return decodeEvents(bytes.subarray(0, readSync(keyboard, bytes)))
		},
		pressedKeys() {
			const state = Buffer.alloc(96)
			ioctl(keyboard, 0x80604518, ptr(state)) // EVIOCGKEY(96)
			return new Set(
				Array.from({ length: state.length * 8 }, (_, code) => code).filter(
					(code) => state[code >> 3] & (1 << (code & 7)),
				),
			)
		},
		emit(event: InputEvent) {
			writeSync(output, encodeEvent(event))
		},
		close() {
			// Closing the physical device also releases its exclusive grab.
			closeSync(keyboard)
			closeSync(output)
			library.close()
		},
	}
}

export type Keyboard = {
	grab(): void
	read(): InputEvent[]
	pressedKeys(): Set<number>
	emit(this: void, event: InputEvent): void
	close(): void
}
