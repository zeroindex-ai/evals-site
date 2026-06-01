# evals-site — agent guide

Eval-report site. Custom tsx generator (`render.ts`) re-skins `@zeroindex-ai/eval-pack`
report HTML to the ZeroIndex visual language and writes static HTML into `public/`,
served at `evals.zeroindex.ai` on Vercel. No client JS, no server runtime.

The *why* and content strategy live in `PROJECT.md`. This file is how to work here.

## Guardrails (do not violate)

- **Never commit secrets** — double-check before `git add -A`.
- **Public repo → sanitize docs.** No machine paths, vault names, private-memory
  refs, or sprint/portfolio framing in committed `.md`. The `md-review-gate` hook enforces it.
- **Branch before the first commit** — confirm `git branch`, don't assume `main`.
- **Visual changes: preview before commit.** Run the dev server, get a human eyeball
  BEFORE committing UI changes.
- **Scope UI edits to the named element** — don't sweep shared design tokens.

## Commands

```bash
pnpm build:css    # tailwindcss src/styles/input.css → public/styles/zeroindex.css (committed artifact; REQUIRED before shipping new classes)
pnpm render       # tsx render.ts → static HTML into public/
pnpm typecheck    # tsc --noEmit, strict + noUncheckedIndexedAccess (covers render + both test files)
pnpm test         # vitest run — wrapWithSiteShell + parseArgs + round-trip + no-JIT class-check
pnpm dev          # serve ./public locally (clean-URL routing, mirrors prod)
```

Add or refresh a single report:

```bash
# 1. Get the source JSON — a fresh run or a downloaded CI artifact:
gh run download <run-id> --repo zeroindex-ai/<project> --name eval-results-<run-id> --dir artifacts/

# 2. Render the JSON to HTML in place. --threshold (0..1) is optional;
#    --redact-answers strips sensitive model output from the report.
pnpm render --in artifacts/run-<timestamp>.json --out public/<project>/latest.html --project <project>

# 3. Commit + push — Vercel auto-deploys.
```

## Conventions & gotchas

- **No SSR / no server runtime** — everything is built at deploy. No API routes, no DB.
- **CSS has no JIT at deploy.** The stylesheet is a static committed file —
  adding a Tailwind utility class in HTML/`render.ts` without running `pnpm build:css`
  ships a class with no rule (silent visual breakage). Always `build:css` after new classes.
  The `class-check.test.ts` no-JIT guard fails the build if a class has no built rule.
- **Render pipeline** — `render.ts` (tsx generator) reads an `@zeroindex-ai/eval-pack`
  `RunReport` JSON, re-skins eval-pack's `renderHtml` output, and emits pre-rendered
  static HTML into `public/<project>/latest.html`. `--redact-answers` strips sensitive
  model output. `public/index.html` and `public/404.html` are hand-authored.
- **Clean URLs on Vercel:** extensionless links 404 unless `vercel.json` sets
  `cleanUrls: true` (Cloudflare→Vercel migration gotcha). `/ask-zeroindex/latest` serves
  `latest.html`; the `.html` form 308-redirects to the extensionless canonical shape.
  Unknown paths fall back to the top-level `public/404.html`.
- **Favicons are real files**, never `data:` URIs — ship the 5-file set + the 5-link
  `<head>` block (Google's favicon indexer ignores `data:` URIs).
- **Chrome is canonical** — the pages share a single same-origin stylesheet at
  `/styles/zeroindex.css` and a single brand mark at `/brand.svg`. Fonts (Inter +
  JetBrains Mono) load from Google Fonts to match the apex; type falls back to
  `ui-sans-serif` / `ui-monospace` if they fail. Match the existing markup; don't reinvent per-page.

## Where to look

- `PROJECT.md` — purpose, content strategy, render pipeline.
- `STYLE_GUIDE.md` (in the `zeroindex-site` repo) — design-system source of truth +
  the `zeroindex-style` skill. Read before non-trivial visual edits.
- Apex chrome ≠ subdomain chrome — never port one to the other.
