import plugin from "tailwindcss/plugin";
import { fontFamily } from "tailwindcss/defaultTheme";

/** @type {import('tailwindcss').Config} */
export default {
	content: ["./src/**/*.svelte"],
	darkMode: ["class"],
	theme: {
		fontFamily: {
			sans: ["Poppins", ...fontFamily.sans],
			// spellchecker:disable
			display: [
				"Kosugi Maru,Segoe UI,Roboto,Oxygen,Ubuntu,Cantarell,Fira Sans,Droid Sans,Helvetica Neue,Arial,sans-serif,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol",
			],
			// spellchecker:enable
		},
		extend: {
			colors: {},
			animation: {
				"bounce-center": "bounce-center 800ms infinite alternate-reverse ease-in-out",
			},
			keyframes: {
				"bounce-center": {
					// "0%, 100%": { transform: "none" },
					// "25%": { transform: "translateY(-25%)" },
					// "75%": { transform: "translateY(25%)" },
					"0%": { transform: "translateY(-10%)" },
					"100%": { transform: "translateY(10%)" },
				},
			},
		},
	},
	plugins: [
		plugin(function ({ matchUtilities, theme }) {
			matchUtilities(
				{
					square: (value) => ({
						width: value,
						height: value,
					}),
				},
				{ values: theme("spacing") },
			);
		}),
	],
};
