import { homedir } from "node:os"
import { join } from "node:path"
import { createEngine } from "./engine.ts"
import { Dictation } from "./dictation.ts"
import { Hotkey, key } from "./hotkey.ts"
import { openKeyboard } from "./keyboard.ts"
import { captureAudio } from "./microphone.ts"
import { pasteText } from "./paste.ts"

if (!process.env.WAYLAND_DISPLAY) throw new Error("Voice requires a Wayland desktop session")
const config = await Bun.file(
	join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "uncode-voice.json"),
).json()
if (
	typeof config.keyboard !== "string" ||
	(config.keycode !== undefined &&
		(!Number.isInteger(config.keycode) || config.keycode < 1 || config.keycode >= 768))
)
	throw new Error("Invalid voice config: expected keyboard path and key code")
const engine = await createEngine()
const keycode = config.keycode ?? key.copilot
const keyboard = openKeyboard(config.keyboard, false, keycode)
const dictation = new Dictation(captureAudio, engine.transcribe, (text) =>
	pasteText(text, keyboard.emit),
)
const hotkey = new Hotkey(
	keyboard.emit,
	() => dictation.start(),
	() => dictation.stop(),
	keycode,
)

// Allow the compositor to discover the new virtual keyboard before taking over.
await Bun.sleep(150)
keyboard.grab()
let checkedKeysAt = 0
const timer = setInterval(() => {
	keyboard.read().forEach((event) => hotkey.feed(event))
	if (hotkey.pressed.size && performance.now() - checkedKeysAt >= 100) {
		hotkey.reconcile(keyboard.pressedKeys())
		checkedKeysAt = performance.now()
	}
	dictation.flush(hotkey.pressed.size > 0)
}, 5)

function shutdown() {
	clearInterval(timer)
	dictation.close()
	keyboard.close()
	void engine.close()
}
process.once("exit", shutdown)
process.once("SIGTERM", () => process.exit(0))
process.once("SIGINT", () => process.exit(0))
console.info(`Ready: hold your dictation key (code ${keycode}), speak, then release`)
