# Knowledge

Knowledge is a minimal Codex textbook-learning plugin with two skills:

- `$knowledge-import` converts a PDF or other supported textbook source into a progressively loaded course with a course map, glossary, equation index, chapter notes, derivation flows, prerequisites, and verified source pages.
- `$knowledge-study` teaches that course in textbook order, one concept at a time, with intuition-first explanations, complete STEM derivations, comprehension checks, and hint-first retries.

## Usage

```text
/knowledge-import textbook.pdf
/knowledge-study course-name
```

Generated courses contain:

```text
course-name/
├── SKILL.md
├── course-map.md
├── glossary.md
├── equations.md
└── chapters/
```

The v1 scope intentionally excludes memory, databases, embeddings, RAG, mastery tracking, review scheduling, Obsidian workflows, web UI, and dashboards. Learning state stays in the current Codex session.

## Upstream foundations

- Extraction and structure detection are adapted from [`virgiliojr94/book-to-skill`](https://github.com/virgiliojr94/book-to-skill).
- Tutor interaction and quiz behavior are adapted from [`bevibing/tutor-skills`](https://github.com/bevibing/tutor-skills).

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for revisions and licenses.
