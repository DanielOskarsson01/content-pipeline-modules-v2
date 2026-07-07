# card-human-rewriter — CLAUDE.md

This is a **config card**, NOT a module — a set of `tone-seo-editor` presets (`preset.json`). It has no `manifest.json` and no `execute.js`, so the module loader skips it. When editing the presets, update README.md — it is the operator contract.

Rules specific to this card:

1. **Config-only, no new code.** Every key in every preset MUST be an existing `tone-seo-editor` manifest option (the test enforces this). If a preset needs something tone-seo-editor can't express, that is a generic change to tone-seo-editor (reviewed on its own), NOT a new option baked for humanization, and NOT a new module. A separate `human-rewriter` module would duplicate tone-seo-editor's execute loop — the specialized-per-content-type anti-pattern (cf. archived cv-generator).
2. **The card CAN carry vertical flavor** (iGaming article rules, cover-letter cliché bans) — Rule 13 puts vertical flavor in template config, which is exactly what a card is. tone-seo-editor's own module default stays agnostic; the flavor lives here in the preset.
3. **Framing: quality, not detector evasion.** No third-party humanizer / AI-detector-bypass services. The QA loop is the existing Step 6 checkers + Step 10 human gate.
4. **The preservation contract is load-bearing.** Every article preset prompt MUST instruct preserving `[Type]` markers, `[#n]` citations, section count, and placed keywords. tone-seo-editor's marker gate hard-enforces `[Type]` markers; Step 6 checkers enforce citations/keywords. Do not weaken these instructions.
5. Run `node modules/step-5-generation/card-human-rewriter/test-human-rewriter-card.js` after any preset change (mocked, free) — it runs the presets through the real tone-seo-editor.
6. **Live-verified 2026-07-07** — `light` preset, one small Sonnet run through tone-seo-editor on a marked+cited article: real model returned a humanized rewrite with all `[Type]` markers + `[#n]` citations preserved (`status: edited`). Re-verify with a small run if the preset prompts change materially.
