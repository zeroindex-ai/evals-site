# evals-site — Project Documentation

> **Phase:** Production
> **Live:** https://evals.zeroindex.ai · **Repo:** github.com/zeroindex-ai/evals-site

Static site hosting public eval-pack reports from ZeroIndex projects — one HTML file
per project, regenerated whenever that project's eval CI runs. It's for anyone who
wants to see how ZeroIndex's AI systems actually score: prospects, collaborators, and
future-you auditing a regression.

> **Section convention:** every numbered section below is expected. If one genuinely
> doesn't apply, the heading is kept with `— n/a: [reason]`. Site-specific sections
> (design system, content & voice) come after §8.

---

## 1. Why this exists

Eval results are the credibility artifact for AI work — they show the systems are
measured, not just shipped. This site publishes those reports at a stable public URL
so they can be linked from the marketing site, a proposal, or a project README.

### Goals & success criteria

| Goal | How I'll know it's met | Status |
| --- | --- | --- |
| Public eval reports per project at a stable URL | `evals.zeroindex.ai/<project>/latest` resolves | ☑ |
| Reports re-skinned to the ZeroIndex visual language | Pages share `/styles/zeroindex.css` + `/brand.svg` | ☑ |
| Refresh a report without a redeploy ceremony | `pnpm render` → commit → Vercel auto-deploys | ☑ |

## 2. Strategic decisions

### Tech stack

| Choice | Why this | Alternative rejected |
| --- | --- | --- |
| Custom tsx generator (`render.ts`, run via `tsx`) | Content is pre-rendered HTML; a generator + a static host is the whole surface — no SSR, no DB, no framework runtime | Astro / Next — heavier than a re-skin step needs |
| `@zeroindex-ai/eval-pack` ^0.3.0 (`report-html`) | Owns the report layout already; the site re-skins its `renderHtml` output rather than reimplementing it | Reimplement the report markup here — duplicates eval-pack |
| Tailwind v4 (`@tailwindcss/cli` ^4.3.0), built to a static stylesheet | Utility classes for the canonical subdomain chrome; built once to a committed file | Tailwind CDN — would add client JS + no offline determinism |
| Vercel ("Other" framework), DNS-only at Cloudflare | Zero-config static host; push-to-`main` auto-deploys | — |
| No client JS | Eval reports are static documents; JS would be pure risk for no interaction | — |
| vitest ^4 + `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) | Guards the render pipeline + the no-JIT CSS footgun | — |

### Key decisions

- **Re-skin rather than re-render** — `render.ts` wraps `@zeroindex-ai/eval-pack`'s own
  `renderHtml` output in the ZeroIndex site shell rather than reimplementing the report
  layout, so the report stays owned by eval-pack and the site owns only the chrome.
- **No client JS** — eval reports are static documents; shipping JS would be pure risk
  for no interaction.
- **Pre-built static stylesheet, not CDN/JIT** — the CSS is a committed build artifact
  (`pnpm build:css`); Tailwind v4 only emits rules for classes it saw at build time, so
  adding a class without rebuilding ships it unstyled. `class-check.test.ts` makes that
  failure loud (see §8).
- **`--redact-answers` over a separate private pipeline** — one generator handles
  sensitive projects (e.g. intake-zero's generated draft emails) by stripping the raw
  model output while keeping pass/fail, categories, timings, and checks public.

## 3. Architecture

**Render pipeline** (generator). A project's eval CI produces an `@zeroindex-ai/eval-pack`
`RunReport` JSON; that JSON is re-skinned into a static page under `public/`:

```
RunReport JSON                     render.ts (tsx generator)
(fresh run OR a downloaded   ─────▶  ├─ parseArgs(argv)          --in/--out/--project/--threshold/--redact-answers
 CI artifact, e.g. under            │  ├─ JSON branch: renderHtml(report, {projectName, threshold?})   ← @zeroindex-ai/eval-pack
 artifacts/<project>/)              │  └─ HTML branch (.html --in): re-wrap an already-rendered page (lost-artifact migration)
                                    ├─ wrapWithSiteShell(inner, project, {redactAnswers?})
                                    │   ├─ extract eval-pack body, strip its inner <footer>
                                    │   ├─ (idempotent) unwrap any prior site shell — never nests
                                    │   ├─ optional redactAnswerText() — strips "Answer text" blocks
                                    │   └─ inject cream theme + sticky header (inline brand.svg) + ZeroIndex footer
                                    └─ mkdir -p + writeFile
                                          │
                                          ▼
                              public/<project>/latest.html   ──▶  Vercel (push to main)  ──▶  evals.zeroindex.ai/<project>/latest
```

- **Idempotence** — `wrapWithSiteShell` detects a prior wrap via the innermost
  `<main class="report-shell">` and unwraps it, so re-running never nests the chrome
  or stacks the "Eval Report" kicker (guarded in §8).
- **Trust boundary** — `bodyContent` comes from `@zeroindex-ai/eval-pack` (first-party),
  so only the `projectName` is HTML-escaped. If a third-party report source is ever
  wired in, the body must be escaped too.
- **Brand mark** — `public/brand.svg` is the single source for the header SVG; `render.ts`
  reads it once at module load and inlines it (decorative `aria-hidden`) into the header.
- **Content sources** — `public/index.html` and `public/404.html` are hand-authored;
  per-project `latest.html` files are generated; `public/styles/zeroindex.css` is a
  committed Tailwind build artifact.
- **URL layout** — `/` is the landing page; `/<project>/latest` serves that project's
  latest run. `vercel.json` sets `cleanUrls: true`, so the `.html` form 308-redirects to
  the extensionless canonical shape and unknown paths fall back to the top-level
  `404.html`.

## 4. Public contract

`— n/a: static site, no API.` The only stable external surface is the URL shape
(`/<project>/latest`) and the per-project JSON artifact it ingests — documented in §5.

## 5. Data model

No database. The generator's only structured input is the `RunReport` JSON emitted by
`@zeroindex-ai/eval-pack` (canonical type: `RunReport` in eval-pack, consumed via
`import type { RunReport } from '@zeroindex-ai/eval-pack'`).

**`RunReport` (top level):**

| Field | Type | What render.ts does with it |
| --- | --- | --- |
| `ran` | `string` (ISO timestamp) | Passed through to `renderHtml`; shown in the report header |
| `results` | `Result[]` | Re-skinned into the report body; also counted for the `passed/total (pct%)` console line |
| `errors` | `Array<{ id; error }>` | Passed through to `renderHtml` (errored items) |
| `judgeName?` | `string` | Passed through when a judge ran |
| `jsonPath?` | `string` | Set by eval-pack when persisted; unused here |

**`Result` (per item — the shape the body is rendered from):**
`id`, `category`, `question`, `text` (raw model output — stripped by `--redact-answers`),
`retrievedRefs[]`, `citationRefs[]`, `recallAtK: number | null`,
`timings: { totalMs; retrievalMs?; firstTokenMs? }`, `metadata`, `checks: CheckResult[]`,
`judgment: Judgment | null`, `pass: boolean`.

**Artifact layout on disk** — source JSON lives under `artifacts/<project>/run-<ISO-timestamp>.json`
(e.g. `artifacts/ask-zeroindex/run-2026-05-15T06-21-49-501Z.json`); the rendered output
is one file per project at `public/<project>/latest.html`. eval-pack itself emits
`run-<ts>.json` when its `resultsDir` is set.

`render.ts` does NOT validate the JSON against a schema — it casts the parsed input to
`RunReport` and relies on eval-pack's `renderHtml` to consume it. Only `results.length`
and `results[].pass` are read directly here (for the stdout summary).

## 6. Project structure

```
render.ts            — the generator: parseArgs, escapeHtml, redactAnswerText,
                       wrapWithSiteShell, main() CLI; inlines public/brand.svg
render.test.ts       — wrapWithSiteShell / escapeHtml / parseArgs / redactAnswerText
                       + a real `pnpm render` CLI round-trip
class-check.test.ts  — no-JIT guard: rebuilds CSS, asserts every referenced class has a rule
src/styles/
  input.css          — Tailwind v4 source (@source globs → public/**/*.html + render.ts;
                       @layer base/components: design tokens + report-shell re-skin)
public/
  index.html         — hand-authored landing page (report-list cards)
  404.html           — hand-authored fallback (Vercel cleanUrls auto-fallback)
  <project>/latest.html — generated per-project reports (ask-zeroindex, repo-xray,
                       contract-lens, intake-zero, …)
  styles/zeroindex.css  — committed Tailwind build artifact (NOT hand-edited)
  brand.svg          — single source for the header brand mark (inlined by render.ts)
  favicon.ico / favicon.svg / favicon-{48,96,180}*.png — the 5-file favicon set
artifacts/<project>/run-*.json — source eval JSON (input to render.ts)
vercel.json          — cleanUrls, buildCommand=pnpm build:css, outputDirectory=public
.github/workflows/ci.yml — typecheck → build:css → test
.github/dependabot.yml   — weekly npm bumps (grouped: vitest/vite, @zeroindex-ai/*, @types/*)
```

## 7. Distribution

`main` → Vercel (auto-deploy via the Vercel GitHub integration). Pushing to `main` ships
to production at `evals.zeroindex.ai`. Vercel "Other" framework. `vercel.json` pins the
build: `buildCommand: pnpm build:css` (rebuilds the static stylesheet), `outputDirectory:
public`, `cleanUrls: true` for extensionless routing. `render.ts` is run separately to
refresh report HTML before pushing (it's not part of the Vercel build — generated HTML is
committed). The top-level `404.html` is the automatic fallback. DNS is managed at
Cloudflare (DNS-only).

### Configuration

`— n/a:` no runtime env vars — the site is fully static. Build settings live in
`vercel.json` (above). The render step takes CLI flags only: `--in`, `--out`, `--project`,
optional `--threshold <0..1>` (tunes eval-pack's pass-rate colouring) and `--redact-answers`.

## 8. Testing & evaluation

CI (`.github/workflows/ci.yml`) runs `pnpm typecheck` → `pnpm build:css` → `pnpm test` on
Node 22. The two vitest suites:

- **`render.test.ts`** — unit + integration. Asserts `wrapWithSiteShell` emits the full
  ZeroIndex shell (header/footer/`report-shell`/"Eval Report" kicker), wires the shared
  assets (site CSS link, inline brand SVG, Google-Fonts, **no Tailwind CDN, no `<script
  src>`**), keeps the eval-pack body while stripping eval-pack's inner `<footer>`, and is
  **idempotent** (re-wrapping yields byte-identical output, never a nested shell or stacked
  kicker). Guards the entire `<head>` (5-file favicon set, font preconnect+stylesheet, site
  CSS) so a dropped `<link>` fails loudly. Covers `escapeHtml` (XSS via project name),
  `parseArgs` (every flag, missing/extra-value/unknown-flag errors, the valueless
  `--redact-answers`), `redactAnswerText` (strips the answer body, keeps surrounding fields,
  idempotent), and a real `pnpm render` CLI **round-trip** (JSON on disk → subprocess →
  wrapped HTML on disk, exercising argv parsing, mkdir, file I/O, and eval-pack's
  `renderHtml`).
- **`class-check.test.ts`** — the **no-JIT guard**. Rebuilds the stylesheet from source
  (never trusts the committed file), collects every class token referenced in `render.ts`
  output *and* in every `public/**/*.html`, and asserts each resolves to a rule in the built
  CSS — catching the silent "added a Tailwind class without `build:css`" footgun. Includes a
  bite test (a bogus class is reported missing; a real one is found) so the assertion isn't
  vacuous.

---

## Design system

Pages share a single same-origin stylesheet at `/styles/zeroindex.css` and a single
brand mark at `/brand.svg`. Type is Inter + JetBrains Mono loaded from Google Fonts to
match the rest of the ZeroIndex properties — without them the type drifts from the apex —
falling back to `ui-sans-serif` / `ui-monospace` (and an installed `JetBrains Mono`) if
the web fonts fail to load. Tokens live in `src/styles/input.css` (`@layer base`: cream
`--bg #faf9f5`, ink `--ink #18181b`, violet `--accent-1 #7c3aed`; `@layer components`:
the subdomain chrome + the `.report-shell` re-skin of eval-pack's markup). The shared
design-system source of truth is `STYLE_GUIDE.md` in the `zeroindex-site` repo plus the
`zeroindex-style` skill; read it before non-trivial visual edits. Apex chrome ≠ subdomain
chrome — never port one to the other.

## Content & voice

Reports are factual, measured artifacts — let the numbers speak. Keep public messaging
consistent with the ZeroIndex tone: independent consultancy taking on engagements, no
over-claiming. The site publishes what was measured; it doesn't editorialize the results.

---

## Ordered work list

- [ ] (none open)

## Decision log (running)

Newest first. Every entry dated.

- **2026-06-01** — Normalized PROJECT.md to the 14-section static-site baseline: added the
  Tech-stack table, an Architecture render-pipeline diagram, Public-contract (n/a),
  Data-model (`RunReport`/`Result` shape + artifact layout), Project-structure file tree,
  Known-constraints, and a Testing section. No behavioral change.
- **2026-05-31** — Backfilled the ZeroIndex documentation standard (AGENTS.md, CLAUDE.md,
  PROJECT.md) from the static-site templates; README left as-is.

## Known constraints & future work

- **No JIT at deploy** — the stylesheet is a committed static artifact; a new Tailwind
  class needs `pnpm build:css` or it ships unstyled. `class-check.test.ts` is the safety
  net, but the rebuild-and-commit is manual.
- **Rendered HTML isn't viewable via `file://`** — pages use absolute asset paths under the
  site root (`/styles/...`, `/brand.svg`, `/favicon*`), so they only render correctly behind
  `evals.zeroindex.ai` (or a local `pnpm dev` static server), not opened directly.
- **No JSON schema validation** — `render.ts` casts the parsed input to `RunReport` and
  trusts eval-pack's `renderHtml`; a malformed artifact surfaces as a render error, not a
  structured validation message.
- **First-party-only trust boundary** — the report body is not HTML-escaped (only the
  project name is). Wiring in a third-party report source would require escaping the body.
- **Report refresh is manual** — `pnpm render` then commit/push; there's no automated
  pull of the latest CI artifact from each upstream project.

## Cross-references

- `@zeroindex-ai/eval-pack` — produces the report HTML this site re-skins (and the
  `RunReport`/`Result` types it ingests).
- `STYLE_GUIDE.md` + the `zeroindex-style` skill (in the `zeroindex-site` repo) — design-system source of truth.
- `AGENTS.md` — how to work in this repo (commands, the add-a-report runbook, gotchas).
