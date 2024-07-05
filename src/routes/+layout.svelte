<script lang="ts">
	import "../app.postcss";

	let { children } = $props();
</script>

<main>
	{@render children()}
</main>
