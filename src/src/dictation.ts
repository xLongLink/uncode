type Recording = { result: Promise<Float32Array>; stop(): void }
type Job = {
	recording?: Recording
	done: boolean
	releasedAt?: number
	text?: string
}

export class Dictation {
	jobs: Job[] = []
	active: Job | undefined = undefined
	processing = Promise.resolve()
	retryAt = 0
	pasteFailed = false

	constructor(
		public capture: () => Recording,
		private transcribe: (audio: Float32Array) => Promise<string>,
		public paste: (text: string) => void,
	) {}

	start() {
		if (this.active) return
		if (this.jobs.length >= 3)
			return console.info("Dictation queue full; wait for pending transcripts")
		let recording
		try {
			recording = this.capture()
		} catch (error) {
			console.error(
				`Dictation failed: ${error instanceof Error ? error.message : String(error)}`,
			)
			return
		}
		const job: Job = { recording, done: false }
		this.active = job
		this.jobs.push(job)
		console.info("Recording (up to 30 seconds); release Copilot to paste")
		// Handle capture errors immediately, even while an earlier job is transcribing.
		const captured = recording.result
			.then(
				(audio) => {
					if (job.releasedAt !== undefined)
						console.info(
							`Microphone shutdown: ${Math.round(performance.now() - job.releasedAt)} ms`,
						)
					return { audio, error: undefined }
				},
				(error: unknown) => ({ audio: undefined, error }),
			)
			.finally(() => {
				job.recording = undefined
			})
		this.processing = this.processing.then(async () => {
			try {
				const { audio, error } = await captured
				if (error) throw error
				if (!audio) throw new Error("Capture returned no audio")
				const started = performance.now()
				job.text = audio.length ? await this.transcribe(audio) : ""
				console.info(
					`Native transcription: ${Math.round(performance.now() - started)} ms (${(audio.length / 16000).toFixed(1)} s audio)`,
				)
			} catch (error) {
				console.error(
					`Dictation failed: ${error instanceof Error ? error.message : String(error)}`,
				)
			} finally {
				job.done = true
			}
		})
	}

	stop() {
		if (!this.active) return
		const job = this.active
		this.active = undefined
		job.releasedAt = performance.now()
		job.recording?.stop()
	}

	flush(keysHeld: boolean) {
		if (keysHeld || performance.now() < this.retryAt) return
		const ready = []
		while (this.jobs[0]?.done) {
			const job = this.jobs.shift()!
			if (job.text === undefined) continue
			if (!job.text) {
				console.info("No speech detected")
				continue
			}
			ready.push(job)
		}
		if (!ready.length) return
		try {
			// One clipboard update prevents queued pastes from reading a later transcript.
			this.paste(ready.map((job) => job.text).join(" "))
			this.pasteFailed = false
			this.retryAt = 0
			const releasedAt = ready[0].releasedAt
			console.info(
				`Pasted transcript${releasedAt === undefined ? "" : ` (${Math.round(performance.now() - releasedAt)} ms after release)`}`,
			)
		} catch (error) {
			this.jobs.unshift(...ready)
			this.retryAt = performance.now() + 1000
			if (!this.pasteFailed)
				console.error(
					`Paste failed; will retry: ${error instanceof Error ? error.message : String(error)}`,
				)
			this.pasteFailed = true
		}
	}

	close() {
		this.jobs.forEach((job) => job.recording?.stop())
		this.active = undefined
	}
}
