<script lang="ts">
	type Props = {
		file_name: string;
		page_count: number;
		progress: Array<number>;
		full_text: string;
		showResultText: (full_text: string) => void;
	};

	let { file_name, page_count, progress, full_text, showResultText }: Props = $props();
	let total_progress = $derived(progress.reduce((acc, curr) => acc + curr) / (page_count + 1));
</script>

<button
	class="my-4 flex items-center justify-between rounded-lg bg-slate-300/50 p-4 disabled:cursor-not-allowed"
	onclick={() => {
		if (total_progress === 1) {
			showResultText(full_text);
		}
	}}
	disabled={total_progress !== 1}
>
	<div>
		<div>{file_name}</div>
		<div>{page_count} Pages</div>
	</div>
	<div class="flex">
		<div class="h-4 w-[400px] overflow-hidden rounded-xl bg-black/30 drop-shadow-md" style={total_progress === 0 ? "background: #eee" : ""}>
			<div
				class="h-full w-full transition-transform"
				style="transform: translateX(-{100 - 100 * total_progress}%); background: {total_progress === 1 ? '#22c55e' : '#ccc'}"
			></div>
		</div>
		<div class="w-12 text-right">
			{#if total_progress > 0}
				{total_progress.toLocaleString("en-US", { style: "percent" })}
			{/if}
		</div>
	</div>
</button>
