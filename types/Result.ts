import type { PDFPageProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

declare global {
	namespace SLAE {
		export type Result = {
			id: Symbol;
			file_name: string;
			pages: Array<PDFPageProxy>;
			page_texts: Map<number, string>; // maybe move this out to improve performance?, its not used reactively
			full_text: string;
		};
	}
}
