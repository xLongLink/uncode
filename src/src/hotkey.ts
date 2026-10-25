export type InputEvent = { type: number; code: number; value: number }

export const key = { shift: 42, insert: 110, super: 125, copilot: 193 }

export class Hotkey {
	pressed = new Set<number>()
	pending: InputEvent[] = []
	hidden = new Set<number>()
	active = false
	dropped = false

	constructor(
		private emit: (event: InputEvent) => void,
		private start: () => void,
		private stop: () => void,
		private keycode = key.copilot,
	) {}

	feed(event: InputEvent) {
		if (event.type === 0 && event.code === 3) {
			this.dropped = true // SYN_DROPPED: ignore unreliable events until SYN_REPORT.
			return
		}
		if (this.dropped) {
			if (event.type === 0 && event.code === 0) this.dropped = false
			return
		}
		if (event.type === 0) return this.emit(event)
		// Forward keys and synchronization only, not hardware scan codes.
		if (event.type !== 1) return
		if (event.value === 1) this.pressed.add(event.code)
		if (event.value === 0) this.pressed.delete(event.code)
		if (event.code === this.keycode) {
			if (event.value === 1 && !this.active) {
				this.pending.forEach((item) => this.hidden.add(item.code))
				this.pending = []
				this.active = true
				this.start()
			}
			if (event.value === 0 && this.active) {
				this.active = false
				this.stop()
			}
			return
		}
		if (this.hidden.has(event.code)) {
			if (event.value === 0) this.hidden.delete(event.code)
			return
		}
		if (
			this.keycode === key.copilot &&
			[key.super, key.shift].includes(event.code) &&
			event.value === 1
		) {
			this.pending.push(event)
			return
		}
		this.pending.forEach((item) => this.emit(item))
		this.pending = []
		this.emit(event)
	}

	reconcile(physicalKeys: Set<number>) {
		if (this.dropped) return
		let released = false
		for (const code of this.pressed) {
			if (physicalKeys.has(code)) continue
			this.feed({ type: 1, code, value: 0 })
			released = true
		}
		if (released) this.emit({ type: 0, code: 0, value: 0 })
	}
}
