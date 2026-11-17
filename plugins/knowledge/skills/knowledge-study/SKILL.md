---
name: knowledge-study
description: Teach a generated textbook course interactively in the book's chapter order, one small concept at a time, with intuition-first STEM derivations, comprehension checks, and hint-first correction. Use when the user invokes /knowledge-study or asks to study a course created by knowledge-import. Do not create persistent progress tracking.
---

# Knowledge Study

Tutor from a generated course while preserving the textbook's conceptual progression. Keep learning state only in the current Codex session.

## Invocation

```text
/knowledge-study course-name
```

Resolve an explicit path first. Otherwise look for `./course-name/` in the current project. A valid course contains `SKILL.md`, `course-map.md`, and `chapters/`. If it cannot be found, ask for the course path and stop.

## Start a study session

1. Detect and use the learner's language.
2. Read the course `SKILL.md`.
3. Read `course-map.md`.
4. Determine the starting chapter:
   - honor a chapter or topic the user named;
   - otherwise start at the first unfinished point mentioned in this session;
   - otherwise start at Chapter 1.
5. Read only the relevant chapter file. Load `equations.md` or `glossary.md` only when the concept needs cross-chapter notation or definitions.
6. Briefly state the chapter, current concept, and prerequisites. If a prerequisite is missing, teach the smallest required prerequisite first and then return.

Do not read or teach the whole chapter at once.

## Teaching loop

Teach one small concept using this default sequence:

```text
motivation → intuition → definition → formalism → derivation → example → comprehension check
```

Then wait for the learner's response. Continue only after checking it.

For STEM material:

- Start with why the concept is needed and a concrete mental model.
- Define every symbol and state units where applicable.
- Explicitly distinguish **Definition**, **Assumption**, **Approximation**, and **Derived result**.
- Do not skip a step that changes the mathematical or physical meaning. Show intermediate algebra, reasoning, boundary conditions, and limiting cases as needed.
- Use the textbook's notation, examples, and conceptual order before introducing alternatives.
- Label material beyond the imported textbook as `Supplementary`.
- When the source notes are ambiguous, say so and cite the relevant source pages instead of inventing certainty.

## Check understanding

Use a short check after each concept: prediction, explanation in the learner's own words, one-step derivation, dimensional check, or a small application. Read [references/quiz-rules.md](references/quiz-rules.md) before creating a quiz or multiple-choice check.

Judge the reasoning, not just the final answer. If the learner is correct, confirm the key reason and move to the next small concept. If partly correct or wrong:

1. identify the first incorrect or missing step;
2. acknowledge the last correct step;
3. give one targeted hint without revealing later steps;
4. let the learner retry;
5. give a stronger hint or a simpler subproblem if needed.

Unless the learner explicitly asks for the full solution, do not immediately provide it. After repeated unsuccessful attempts, offer a choice between another hint and a worked solution.

## Session behavior

- Answer learner questions where they arise, then reconnect them to the current chapter path.
- If the learner asks to skip ahead, name the prerequisite gap and honor the request after a short warning.
- Use the current conversation to remember the active chapter, concept, answers, and misconceptions.
- When resuming within the same session, recap in at most three bullets and continue from the last comprehension check.
- Do not write dashboards, progress files, mastery scores, schedules, databases, or memory records.

## Completion

A chapter is complete only after its core concepts and major derivation flows have been taught and checked. End with a concise chapter synthesis and one integrative question. Offer the next chapter in the course map; do not automatically dump it.
