<script lang="ts">
	import type { Scheduler, Worker } from "tesseract.js";
	import type { PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

	import { onMount } from "svelte";
	import { createWorker, createScheduler, PSM } from "tesseract.js";
	import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"; //https://stackoverflow.com/questions/78415681/pdf-js-pdfjs-dist-promise-withresolvers-is-not-a-function
	import "pdfjs-dist/build/pdf.worker.mjs";
	import { createDialog, melt } from "@melt-ui/svelte";
	import { SvelteMap } from "svelte/reactivity";
	import { fade } from "svelte/transition";

	import { FilePlus, Loader, Files } from "lucide-svelte";
	import Result from "./Result.svelte";

	// TODO: Scale workers based on pages
	const DEFAULT_WORKER_COUNT = 10;
	// const MAX_WORKER_COUNT = 20;

	let ocr_scheduler = $state<Scheduler>(createScheduler());
	let ocr_workers = $state<Array<Worker>>([]);

	let files = $state<FileList>();
	let total_pages = $state(0);

	type App_State = "LOADING_FILES" | "SCANNING_FILES" | "REGISTERING_WORKERS" | "REST";
	let app_state = $state<App_State>("REST");

	const results = new SvelteMap<Symbol, SLAE.Result>();
	const progresses = new SvelteMap<Symbol, Array<number>>();

	let result_text = $state("");
	const {
		elements: { overlay, content, portalled },
		states: { open },
	} = createDialog();
	function showResultText(full_text: string) {
		result_text = full_text;
		$open = true;
	}

	onMount(() => {
		(async () => {
			app_state = "REGISTERING_WORKERS";
			await addWorkers(DEFAULT_WORKER_COUNT);
			console.log(`Registered ${ocr_scheduler.getNumWorkers()} Tesseract Workers`);
			app_state = "REST";
		})();
	});

	async function addWorkers(n_workers: number) {
		for (let i = 0; i < n_workers; i++) {
			const worker = await createWorker("eng", 1, {
				logger: (m) => {
					if (m.progress && m.status === "recognizing text") {
						// console.log(m.progress);
						const ids = m.userJobId.split(":PAGE_NUMBER:");
						const progress = progresses.get(Symbol.for(ids[0]!));
						progress![(ids[1] as unknown as number) - 1] = m.progress;
					}
				},
			});
			// spellchecker: disable-next-line
			worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO_OSD });
			ocr_scheduler.addWorker(worker);
			ocr_workers.push(worker);
		}
	}
	async function clearWorkers() {
		for (const worker of ocr_workers) {
			await worker.terminate();
		}
		ocr_workers = [];
	}

	async function handleFileInput() {
		if (app_state !== "REST") return;
		if (files) {
			results.clear();
			total_pages = 0;
			for (const file of files) {
				app_state = "LOADING_FILES";
				if (results.size === 10) {
					app_state = "REST";
					return;
				}
				if (file.type !== "application/pdf") continue;
				const id = Symbol.for(file.name);
				if (results.get(id)) continue; // keep this here, put this on the next line to see why: await new Promise((r) => setTimeout(r, 1000));

				const pdf = await getDocument(URL.createObjectURL(file)).promise; // ignore fake worker warning
				const pages = $state([]);
				const page_texts = new SvelteMap<number, string>();
				const reactive_array = $state(Array(pdf.numPages).fill(0));
				progresses.set(id, reactive_array);
				const result = results.set(id, { id, file_name: file.name, pages, page_texts, full_text: "" }).get(id)!;
				for (let page_number = 1; page_number < pdf.numPages; page_number++) {
					result.pages.push(await pdf.getPage(page_number));
					total_pages++;
				}
			}
			app_state = "REST";
		}
	}

	// async function extract_scan() {
	// 	if (files === undefined) return;
	// 	for (const file of files) {
	// 		if (file.type !== "application/pdf") continue;
	// 		const pdf = await getDocument(URL.createObjectURL(file)).promise;
	// 		let document_text = "";

	// 		for (let page_number = 1; page_number < pdf.numPages; page_number++) {
	// 			const page_text = await (await pdf.getPage(page_number)).getTextContent();
	// 			document_text += page_text.items
	// 				// @ts-ignore
	// 				.filter((item) => item.str !== undefined)
	// 				// @ts-ignore
	// 				.map((item) => item.str)
	// 				.join("\n");
	// 		}

	// 		// text = document_text;
	// 	}
	// }

	/**
	 * Tesseract scans images. We must first convert the uploaded PDFs into images
	 * We use pdf.js to create canvas elements from each PDF page
	 * We send each image off to the scheduler to do a scan
	 * Settings: OCR, OSD, Auto Page Segmentation
	 */
	async function processPage(page: PDFPageProxy, id: Symbol, file_name: string) {
		const viewport = page.getViewport({ scale: 2 });
		const canvas = document.createElement("canvas");
		const context = canvas.getContext("2d")!; // possibly null
		canvas.height = viewport.height;
		canvas.width = viewport.width;

		await page.render({ canvasContext: context, viewport }).promise;
		const { data } = await ocr_scheduler.addJob("recognize", canvas, undefined, undefined, file_name + ":PAGE_NUMBER:" + page.pageNumber);
		// Because this data is not returned until some time after the logger fires progress: 1, for some god forsaken reason, we have an extra progress index that gets added to here
		const progress = progresses.get(id)!;
		const result = results.get(id)!;
		progress[progress.length - 1]! += 1 / result.pages.length;

		result.page_texts.set(page.pageNumber, data.text);

		if (progress[progress.length - 1]! > 0.99) {
			// HACK: 0.99 might not be the smart way to fix this (what if there are 100 pages!)
			let full_text = ""; // temp variable so it doesn't visually update n times
			for (let i = 1; i <= result.page_texts.size; i++) {
				full_text += result.page_texts.get(i) + "\n\n";
			}
			result.full_text = full_text;
			console.log("Full text complete:", result.file_name);
		}
	}
	// FIXME: why is there a delay to this function call execution??, that can be a problem, app_state needs to be updated immediately to block concurrent runs
	async function scan() {
		if (app_state !== "REST") return;
		app_state = "SCANNING_FILES";
		// build promises for every page
		const promises: Array<Promise<void>> = [];
		results.forEach((value) => {
			value.pages.forEach((page) => {
				promises.push(processPage(page, value.id, value.file_name));
			});
		});
		await Promise.all(promises);
	}
</script>

<h1 class="my-6 text-center text-6xl font-bold">SLAE PDF Parser</h1>

<div class="relative mt-10">
	{#if app_state === "REGISTERING_WORKERS"}
		<div class="absolute -top-7 left-1/2 flex -translate-x-1/2 animate-pulse items-center gap-x-1 text-sm" transition:fade>
			<Loader size={15} class="animate-spin" />
			<div class="animate-bounce-center">Registering Tesseract Workers...</div>
		</div>
	{/if}
	<label
		for="files-select"
		class="relative mx-auto block max-w-[210px] cursor-pointer rounded-xl bg-red-600 px-6 py-4 text-2xl font-medium text-white/90 drop-shadow-[0_5px_10px_rgba(0,0,0,0.15)]"
		style={app_state !== "REST" ? "opacity:0.5;cursor:not-allowed" : ""}
	>
		<FilePlus class="absolute right-5 top-1/2 -translate-y-1/2" size={30}></FilePlus>
		Select Files
	</label>
	<input class="hidden" id="files-select" type="file" accept="application/pdf" multiple bind:files onchange={handleFileInput} disabled={app_state !== "REST"} />
	<div class="mt-2 text-center text-xs text-gray-800">(Maximum of 10 files)</div>
</div>

<div class="mx-auto mt-8 min-h-[500px] w-2/3 max-w-[900px] rounded-xl bg-gray-200 p-6 drop-shadow-md">
	<div class="grid grid-cols-2 grid-rows-3 gap-y-2 text-xl">
		<div><strong>Files:</strong> {results.size}</div>
		<div class="row-start-2"><strong>Pages:</strong> {total_pages}</div>
		<hr class="col-span-2 row-start-3 mt-2 h-[3px] bg-red-600" />

		<button
			class="col-start-2 row-span-2 mr-2 w-[80px] place-self-end rounded-xl bg-red-700 p-2 text-center font-medium text-white disabled:cursor-not-allowed disabled:opacity-35"
			onclick={scan}
			disabled={app_state !== "REST" || results.size < 1}
		>
			Scan
		</button>
	</div>

	<div class="flex flex-col">
		{#if files}
			{#each results as [id, { file_name, pages, full_text }]}
				{@const progress = progresses.get(id)!}
				<Result {file_name} page_count={pages.length} {progress} {full_text} {showResultText} />
			{/each}
		{/if}
	</div>
</div>

<!-- Full Text Dialog -->
{#if $open}
	<div use:melt={$portalled}>
		<div use:melt={$overlay} class="fixed inset-0 z-50 bg-black/50" transition:fade={{ duration: 150 }}></div>
		<div
			use:melt={$content}
			class="fixed left-1/2 top-1/2 z-50 h-[90vh] w-[95vw] max-w-[1200px] -translate-x-1/2 -translate-y-1/2 overflow-x-scroll rounded-xl bg-gray-200 p-12 text-lg leading-10 shadow-lg"
		>
			<button class="absolute right-5 top-5" onclick={() => navigator.clipboard.writeText(result_text)}><Files /></button>
			<div class="h-[90%] whitespace-pre-wrap">{result_text}</div>
		</div>
	</div>
{/if}
