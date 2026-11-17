# Extraction dependencies

The bundled extractor is self-contained Python source adapted from `book-to-skill`; optional format libraries remain external.

## PDF

- Technical mode: `docling` gives the best tables, formulas, and code layout.
- Text fallback: any of Poppler `pdftotext`, `pypdf`, or `pdfminer.six`.
- Scanned PDFs: OCR first with a tool such as `ocrmypdf`, then rerun.

Use the extractor's `--check` option to inspect availability. With `--install-missing ask`, it may offer to install a missing Python dependency; installation remains confirmation-gated. With `--no-install-missing`, it uses available fallbacks without installing anything.

## Other formats

- EPUB: `ebooklib` + `beautifulsoup4`, with a standard-library fallback.
- DOCX: `python-docx`, with a ZIP/XML fallback.
- HTML: `trafilatura` or `beautifulsoup4`, with a standard-library fallback.
- RTF: `striprtf`, with a basic fallback.
- MOBI/AZW/AZW3: Calibre's `ebook-convert` is required.

Do not install system packages without the user's approval. Report the chosen extraction method from `metadata.json` so quality limits remain visible.
