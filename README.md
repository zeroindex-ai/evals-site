# evals-site

Static site at [`evals.zeroindex.ai`](https://evals.zeroindex.ai) hosting public eval-pack reports from ZeroIndex projects.

## What this is

Public eval reports — one HTML file per project, regenerated whenever that project's eval CI runs. Each report is produced by [`@zeroindex-ai/eval-pack`](https://github.com/zeroindex-ai/eval-pack)'s `renderHtml` and re-skinned to the ZeroIndex visual language by [`render.ts`](./render.ts).

No client JS, no third-party CDN scripts, no Google Fonts. The pages share a single same-origin stylesheet at [`/styles/zeroindex.css`](./public/styles/zeroindex.css) and a single brand mark at [`/brand.svg`](./public/brand.svg). Typography falls back to `ui-sans-serif` / `ui-monospace`, picking up the visitor's installed `JetBrains Mono` if present.

## Layout

```
evals-site/
├── public/                       ← served as the site root
│   ├── index.html
│   ├── 404.html
│   ├── brand.svg
│   ├── styles/
│   │   └── zeroindex.css
│   ├── ask-zeroindex/
│   │   └── latest.html
│   └── dummy-agent/
│       └── latest.html
├── render.ts                     ← helper to refresh reports
├── render.test.ts                ← vitest snapshot + arg-parsing tests
├── tsconfig.json
├── package.json                  ← dev tooling only; not deployed
└── wrangler.jsonc
```

## URL layout

```
evals.zeroindex.ai/                       → landing page (public/index.html)
evals.zeroindex.ai/<project>/latest       → latest run for that project
```

`wrangler.jsonc` pins `assets.html_handling: "auto-trailing-slash"` and `assets.not_found_handling: "404-page"`, so `/ask-zeroindex/latest` resolves to `latest.html` and unknown paths render `/404.html`.

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

# 3. Commit + push — Cloudflare auto-deploys.
git add public/<project>/latest.html && git commit -m "Refresh <project> report" && git push
```

## Develop

```bash
pnpm typecheck   # tsc --noEmit, strict + noUncheckedIndexedAccess
pnpm test        # vitest run — covers wrapWithSiteShell + parseArgs
pnpm dev         # wrangler dev — serves ./public locally
```

## Deploy

`main` → Cloudflare Workers Static Assets (auto-deploy via the `cloudflare-workers-and-pages` GitHub App, same pipeline as [`zeroindexai`](https://github.com/zeroindex-ai/zeroindexai)).

## License

MIT — see [LICENSE](./LICENSE).
