import { defineConfig } from "vite-plus"

export default defineConfig({
	lint: {
		options: { typeAware: true, typeCheck: true },
		ignorePatterns: ["dist/**", ".cache/**", ".venv/**"],
		overrides: [
			{
				files: ["**/tests/*.test.ts"],
				// Bun's assertion types return void, but rejects matchers are asynchronous.
				rules: { "typescript/await-thenable": "off" },
			},
		],
	},
	fmt: {
		useTabs: true,
		tabWidth: 4,
		semi: false,
		ignorePatterns: ["dist/**", ".cache/**", ".venv/**", "bun.lock"],
	},
})
