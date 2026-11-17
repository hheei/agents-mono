# How knowledge-import works

This workflow is adapted from `virgiliojr94/book-to-skill`. It keeps the upstream extraction chain and progressive-loading design while changing the generated artifact from a general book skill to a STEM-oriented course.

## Extraction chain

For technical PDFs, the bundled extractor first tries Docling for layout-aware Markdown. If unavailable, it falls back through `pdftotext`, `pypdf`, and `pdfminer.six`. Other supported formats keep the upstream fallback chains.

The extractor writes one unique temporary work directory per run:

- `full_text.txt` — normalized extracted content;
- `metadata.json` — sources, formats, extraction methods, page counts, token estimate, chapter detection method, and TOC signal.

Never use a hard-coded work directory. Read the paths printed by the command or the `workdir` field in metadata.

## Structure detection

The vendored detector recognizes explicit chapter headings across multiple scripts and languages, numbered headings, Markdown/AsciiDoc structure, and TOC signals. Detection proposes boundaries; the importing agent must verify them against the source before creating the course map.

## Page attribution

Docling Markdown is the content source for formulas and layout. A separate text-mode extraction with `COURSE_PRESERVE_PAGE_MARKERS=1` provides physical PDF page markers. Match headings and distinctive nearby text between the two outputs. Never infer a page range solely from chapter order.

## Progressive loading

The generated `SKILL.md` and `course-map.md` are small routing files. Detailed notes live in individual `chapters/` files and are read only when that chapter is studied. `equations.md` and `glossary.md` are loaded only when notation or cross-chapter lookup is needed.

This is filesystem-based progressive disclosure, not RAG: there are no embeddings, vector indexes, databases, or retrieval services.
