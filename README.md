# evals-site

Static site at [`evals.zeroindex.ai`](https://evals.zeroindex.ai) hosting public eval-pack reports from ZeroIndex projects.

## What this is

Public eval reports — one HTML file per project, regenerated whenever that project's eval CI runs. Each report is produced by [`@zeroindex-ai/eval-pack`](https://github.com/zeroindex-ai/eval-pack)'s `renderHtml` and re-skinned to the ZeroIndex visual language by [`render.ts`](./render.ts).

No client JS. The pages load Inter + JetBrains Mono from Google Fonts — matching the rest of the ZeroIndex properties; without them the type drifts from the apex — and otherwise share a single same-origin stylesheet at [`/styles/zeroindex.css`](./public/styles/zeroindex.css) and a single brand mark at [`/brand.svg`](./public/brand.svg). Type falls back to `ui-sans-serif` / `ui-monospace` (and an installed `JetBrains Mono`) if the web fonts fail to load.

## Layout

```
evals-site/
├── public/                       ← served as the site root
│   ├── index.html                ← landing page (hand-authored)
│   ├── 404.html                  ← fallback page (hand-authored)
│   ├── brand.svg                 ← brand mark (read once by render.ts)
│   ├── favicon.ico
│   ├── favicon.svg
│   ├── favicon-48x48.png
│   ├── favicon-96x96.png
│   ├── favicon-180x180.png
│   ├── styles/
│   │   └── zeroindex.css          ← built artifact (committed; from build:css)
│   ├── ask-zeroindex/
│   │   └── latest.html
│   ├── contract-lens/
│   │   └── latest.html
│   ├── dummy-agent/
│   │   └── latest.html
│   ├── intake-zero/
│   │   └── latest.html
│   └── repo-xray/
│       └── latest.html
├── src/
│   └── styles/
│       └── input.css             ← Tailwind v4 source → build:css → zeroindex.css
├── render.ts                     ← helper to refresh reports
├── render.test.ts                ← vitest: wrapWithSiteShell + parseArgs + round-trip
├── class-check.test.ts           ← no-JIT guard: every class has a built rule
├── tsconfig.json
├── package.json                  ← dev tooling only; not deployed
└── vercel.json                   ← cleanUrls routing + runs build:css on deploy
```

## URL layout

```
evals.zeroindex.ai/                       → landing page (public/index.html)
evals.zeroindex.ai/<project>/latest       → latest run for that project
```

`vercel.json` sets `cleanUrls: true`, so `/ask-zeroindex/latest` serves `latest.html` and the `.html` form 308-redirects to the extensionless canonical shape. Unknown paths fall back to `/404.html` automatically (Vercel serves a top-level `404.html` from the output directory).

## Add or refresh a report

```bash
# 1. Get the source JSON. Either a fresh run:
pnpm tsx ./some-project/evals/run.ts
#    or download the latest CI artifact:
gh run download <run-id> --repo zeroindex-ai/<project> --name eval-results-<run-id> --dir artifacts/

# 2. Render the JSON to HTML in place. --threshold (0..1) is optional and
#    only affects the pass-rate colouring inside eval-pack's renderer.
pnpm render \
  --in artifacts/run-<timestamp>.json \
  --out public/<project>/latest.html \
  --project <project>

# 3. Commit + push — Vercel auto-deploys.
git add public/<project>/latest.html && git commit -m "Refresh <project> report" && git push
```

## Develop

```bash
pnpm build:css   # tailwindcss src/styles/input.css → public/styles/zeroindex.css (committed artifact)
pnpm typecheck   # tsc --noEmit, strict + noUncheckedIndexedAccess (covers render + both test files)
pnpm test        # vitest run — wrapWithSiteShell + parseArgs + round-trip + no-JIT class-check
pnpm dev         # serve ./public locally (clean-URL routing, mirrors prod)
```

## Deploy

`main` → Vercel (auto-deploy via the Vercel GitHub integration). Pushing to `main` ships to production at `evals.zeroindex.ai`.

## License

MIT — see [LICENSE](./LICENSE).
