type Recording = { result: Promise<Float32Array>; stop(): void }
type Operation = {
	recording?: Recording
	text?: string
}

export class Dictation {
	private pending: Operation | undefined
	processing = Promise.resolve()
	retryAt = 0

	constructor(
		public capture: () => Recording,
		private transcribe: (audio: Float32Array) => Promise<string>,
		public paste: (text: string) => void,
	) {}

	start() {
		if (this.pending) return console.info("Dictation busy; wait for the pending transcript")
		let recording
		try {
			recording = this.capture()
		} catch (error) {
			console.error(
				`Dictation failed: ${error instanceof Error ? error.message : String(error)}`,
			)
			return
		}
		const operation: Operation = { recording }
		this.pending = operation
		console.info("Recording (up to 30 seconds); release your dictation key to paste")
		this.processing = recording.result
			.then(async (audio) => {
				if (this.pending !== operation) return
				operation.recording = undefined
				operation.text = audio.length ? await this.transcribe(audio) : ""
			})
			.catch((error: unknown) => {
				if (this.pending === operation) this.pending = undefined
				console.error(
					`Dictation failed: ${error instanceof Error ? error.message : String(error)}`,
				)
			})
	}

	stop() {
		this.pending?.recording?.stop()
	}

	flush(keysHeld: boolean) {
		if (keysHeld || performance.now() < this.retryAt) return
		const text = this.pending?.text
		if (text === undefined) return
		if (!text) {
			this.pending = undefined
			console.info("No speech detected")
			return
		}
		try {
			this.paste(text)
			this.pending = undefined
			this.retryAt = 0
			console.info("Pasted transcript")
		} catch (error) {
			const retrying = this.retryAt !== 0
			this.retryAt = performance.now() + 1000
			if (!retrying)
				console.error(
					`Paste failed; will retry: ${error instanceof Error ? error.message : String(error)}`,
				)
		}
	}

	close() {
		const operation = this.pending
		this.pending = undefined
		operation?.recording?.stop()
	}
}
