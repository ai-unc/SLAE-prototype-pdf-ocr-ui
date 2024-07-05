import adapter from "@sveltejs/adapter-vercel";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { preprocessMeltUI } from "@melt-ui/pp";

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: [vitePreprocess(), preprocessMeltUI()],

	kit: {
		adapter: adapter(),
	},
};

export default config;
