# evals-site — Project Documentation

> **Phase:** Production
> **Live:** https://evals.zeroindex.ai · **Repo:** github.com/zeroindex-ai/evals-site

Static site hosting public eval-pack reports from ZeroIndex projects — one HTML file
per project, regenerated whenever that project's eval CI runs. It's for anyone who
wants to see how ZeroIndex's AI systems actually score: prospects, collaborators, and
future-you auditing a regression.

---

## 1. Why this exists

Eval results are the credibility artifact for AI work — they show the systems are
measured, not just shipped. This site publishes those reports at a stable public URL
so they can be linked from the marketing site, a proposal, or a project README.

**Goals**

| Goal | How I'll know it's met | Status |
| --- | --- | --- |
| Public eval reports per project at a stable URL | `evals.zeroindex.ai/<project>/latest` resolves | ☑ |
| Reports re-skinned to the ZeroIndex visual language | Pages share `/styles/zeroindex.css` + `/brand.svg` | ☑ |
| Refresh a report without a redeploy ceremony | `pnpm render` → commit → Vercel auto-deploys | ☑ |

## 2. Strategic decisions

- **Stack** — custom tsx generator (`render.ts`) + Tailwind v4 (built to a static
  stylesheet) · Vercel (DNS-only at Cloudflare). No framework: the content is
  pre-rendered HTML, so a generator + a static host is the whole surface — no SSR, no DB.
- **Re-skin rather than re-render** — `render.ts` wraps `@zeroindex-ai/eval-pack`'s own
  `renderHtml` output in the ZeroIndex site shell rather than reimplementing the report
  layout, so the report stays owned by eval-pack and the site owns only the chrome.
- **No client JS** — eval reports are static documents; shipping JS would be pure risk
  for no interaction.

## 3. Site architecture

- **Render pipeline** (generator) — source eval `RunReport` JSON (a fresh project run or
  a downloaded CI artifact) → `render.ts` re-skins `@zeroindex-ai/eval-pack`'s `renderHtml`
  and emits pre-rendered static HTML into `public/<project>/latest.html`. The
  `--redact-answers` flag strips sensitive model output; `--threshold` (0..1) tunes the
  pass-rate colouring inside eval-pack's renderer.
- **Content sources** — `public/index.html` and `public/404.html` are hand-authored;
  per-project `latest.html` files are generated; `public/styles/zeroindex.css` is a
  committed Tailwind build artifact; `public/brand.svg` is read once by `render.ts`.
- **URL layout** — `evals.zeroindex.ai/` is the landing page; `/<project>/latest` serves
  that project's latest run. `vercel.json` sets `cleanUrls: true`, so the `.html` form
  308-redirects to the extensionless canonical shape and unknown paths fall back to
  the top-level `404.html`.

## 4. Design system

Pages share a single same-origin stylesheet at `/styles/zeroindex.css` and a single
brand mark at `/brand.svg`. Type is Inter + JetBrains Mono loaded from Google Fonts to
match the rest of the ZeroIndex properties — without them the type drifts from the apex —
falling back to `ui-sans-serif` / `ui-monospace` (and an installed `JetBrains Mono`) if
the web fonts fail to load. The shared design-system source of truth is `STYLE_GUIDE.md`
in the `zeroindex-site` repo plus the `zeroindex-style` skill; read it before non-trivial
visual edits. Apex chrome ≠ subdomain chrome — never port one to the other.

## 5. Content & voice

Reports are factual, measured artifacts — let the numbers speak. Keep public messaging
consistent with the ZeroIndex tone: independent consultancy taking on engagements, no
over-claiming. The site publishes what was measured; it doesn't editorialize the results.

## 6. Distribution

`main` → Vercel (auto-deploy via the Vercel GitHub integration). Pushing to `main` ships
to production at `evals.zeroindex.ai`. Vercel "Other" framework: build command
`pnpm build:css` (rebuilds the static stylesheet), output directory `public`; `render.ts`
is run separately to refresh report HTML before pushing. `vercel.json` sets
`cleanUrls: true` for extensionless routing; the top-level `404.html` is the automatic
fallback. DNS is managed at Cloudflare (DNS-only).

---

## Ordered work list

- [ ] (none open)

## Decision log (running)

- **2026-05-31** — Backfilled the ZeroIndex documentation standard (AGENTS.md, CLAUDE.md,
  PROJECT.md) from the static-site templates; README left as-is.

## Cross-references

- `@zeroindex-ai/eval-pack` — produces the report HTML this site re-skins.
- `STYLE_GUIDE.md` + the `zeroindex-style` skill (in the `zeroindex-site` repo) — design-system source of truth.
