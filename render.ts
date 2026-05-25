// Render a saved RunReport JSON into a single HTML file wrapped in the
// zeroindex.ai site shell (sticky header, cream theme, system + JetBrains-Mono
// typography, max-w-6xl container, footer in matching style).
//
// Usage: pnpm render --in <path.json> --out <path.html> --project <name> [--threshold <0..1>] [--redact-answers]
//
// --redact-answers strips the raw model output ("Answer text") from the report,
// keeping pass/fail, categories, timings, and checks. Use it for projects whose
// output is sensitive — e.g. intake-zero's generated draft emails.
//
// To re-skin a previously rendered HTML file (no source JSON), pass --in <path.html>:
// the file is detected as HTML and rewrapped through wrapWithSiteShell. This is the
// migration path for reports whose source artifact has been lost.
//
// No Tailwind CDN, no client JS. Inter + JetBrains Mono load from Google Fonts
// (see the <head> links below — matches the canonical ZeroIndex chrome). The
// site CSS lives at /styles/zeroindex.css and the brand mark at /brand.svg — both served as
// static assets by Vercel. The rendered HTML is therefore not viewable
// stand-alone via file:// (it relies on absolute paths under the site root)
// but is fully self-contained behind evals.zeroindex.ai.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderHtml } from '@zeroindex-ai/eval-pack/report-html';
import type { RunReport } from '@zeroindex-ai/eval-pack';

// ─── Brand mark ─────────────────────────────────────────────────────────────
//
// Single source of truth for the header brand SVG path geometry:
// public/brand.svg. Read once at module load and cached. The standalone
// brand.svg is a labelled image (role="img" aria-label="ZeroIndex"); the
// header copy is *decorative* — its parent <a class="brand-link"
// aria-label="ZeroIndex home"> already names the link — so we swap the a11y
// attributes to aria-hidden="true" and indent the markup to sit inside the
// header. The transform is byte-exact: it reproduces the previously-inlined
// block verbatim, so the rendered HTML does not change.
const repoRoot = dirname(fileURLToPath(import.meta.url));

function loadBrandSvgInline(): string {
  const raw = readFileSync(join(repoRoot, 'public', 'brand.svg'), 'utf-8').trim();
  return (
    raw
      // Decorative inside an already-labelled link, not a standalone image.
      .replace('role="img" aria-label="ZeroIndex"', 'aria-hidden="true"')
      // Match the previously-inlined self-closing style (no space before />).
      .replace(/ \/>/g, '/>')
      // Re-indent: <svg>/</svg> at 10 spaces, <path> children at 12.
      .split('\n')
      .map((line) => {
        const t = line.trimStart();
        const indent = t.startsWith('<path') ? '            ' : '          ';
        return indent + t;
      })
      .join('\n')
      .trimStart()
  );
}

const BRAND_SVG_INLINE = loadBrandSvgInline();

export type Args = {
  in?: string;
  out?: string;
  project?: string;
  threshold?: number;
  redactAnswers?: boolean;
};

const VALUE_FLAGS = new Set(['--in', '--out', '--project', '--threshold']);
// Boolean (valueless) flags. --redact-answers strips eval-pack's "Answer text"
// blocks — for projects whose model output is sensitive (e.g. intake-zero's
// generated draft emails) while keeping pass/fail, categories, and checks public.
const BOOLEAN_FLAGS = new Set(['--redact-answers']);

export function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (BOOLEAN_FLAGS.has(a)) {
      if (a === '--redact-answers') out.redactAnswers = true;
      continue;
    }
    if (!VALUE_FLAGS.has(a)) {
      throw new Error(`Unknown flag: ${a}`);
    }
    const v = argv[i + 1];
    if (v === undefined || VALUE_FLAGS.has(v)) {
      throw new Error(`Missing value for ${a}`);
    }
    if (a === '--in') {
      out.in = v;
    } else if (a === '--out') {
      out.out = v;
    } else if (a === '--project') {
      out.project = v;
    } else if (a === '--threshold') {
      const n = Number(v);
      if (!Number.isFinite(n)) {
        throw new Error(`--threshold expects a number, got "${v}"`);
      }
      out.threshold = n;
    }
    i++;
  }
  return out;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return c;
    }
  });
}

/**
 * Wrap eval-pack's renderHtml() output in the zeroindex.ai site shell.
 *
 * Strips eval-pack's inner <footer> (the site footer credits eval-pack
 * already), keeps the report body, and injects the cream theme, sticky
 * header, and ZeroIndex-styled site footer.
 *
 * Trust boundary: `bodyContent` comes from @zeroindex-ai/eval-pack (a
 * first-party package). Only `projectName` is HTML-escaped; if a third-
 * party report source is ever wired in, escape the body too.
 *
 * **Idempotent.** If the input is already a wrapped page (detected via
 * `<main class="report-shell">`), the inner report content is extracted
 * from the report-shell and the kicker label is stripped, so re-running
 * the wrapper doesn't nest the site chrome.
 */
/**
 * Strip eval-pack's "Answer text" blocks (the raw model output) from a report
 * body. eval-pack renders the output as a `<div class="text">…</div>` immediately
 * after the "Answer text:" label; `.text` is used for nothing else and the body
 * is HTML-escaped (no nested tags), so a non-greedy match to the first </div> is
 * exact. Used for projects whose output is sensitive — e.g. intake-zero's draft
 * emails — while keeping pass/fail, categories, timings, and checks visible.
 * Idempotent: once redacted there's no .text block left to match.
 */
export function redactAnswerText(html: string): string {
  return html.replace(
    /<div class="field"><span class="field-label">Answer text:<\/span><\/div>\s*<div class="text">[\s\S]*?<\/div>/g,
    '<div class="field"><span class="field-label">Answer text:</span> <span class="muted">withheld (internal)</span></div>'
  );
}

export function wrapWithSiteShell(
  innerHtml: string,
  projectName: string,
  opts: { redactAnswers?: boolean } = {}
): string {
  // If the file has been wrapped before (one or more times — earlier versions of
  // this function were not idempotent and produced nested shells), the *innermost*
  // <main class="report-shell"> is always the one that contains the actual
  // eval-pack body; everything outside it is duplicate ZeroIndex chrome.
  const shellOpens = [...innerHtml.matchAll(/<main\b[^>]*\bclass="[^"]*\breport-shell\b[^"]*"[^>]*>/gi)];

  let bodyContent: string;
  if (shellOpens.length > 0) {
    const last = shellOpens[shellOpens.length - 1];
    if (last && last.index !== undefined) {
      const start = last.index + last[0].length;
      const end = innerHtml.indexOf('</main>', start);
      if (end > start) {
        bodyContent = innerHtml.slice(start, end).trim();
        // Strip any leading "Eval Report" kicker the previous wrap added.
        bodyContent = bodyContent.replace(/^<div\s+class="label"[^>]*>\s*Eval Report\s*<\/div>\s*/i, '');
      } else {
        bodyContent = extractBody(innerHtml);
      }
    } else {
      bodyContent = extractBody(innerHtml);
    }
  } else {
    // First-time wrap of raw eval-pack output.
    bodyContent = extractBody(innerHtml);
  }

  // Drop eval-pack's inner <footer> — site footer credits eval-pack already.
  bodyContent = bodyContent.replace(/<footer[\s\S]*?<\/footer>/gi, '').trim();

  // Optionally strip the raw model output (e.g. intake-zero's draft emails).
  if (opts.redactAnswers) {
    bodyContent = redactAnswerText(bodyContent);
  }

  const safeProject = escapeHtml(projectName);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${safeProject} eval results · ZeroIndex</title>
  <meta name="description" content="Live eval report for ${safeProject}, generated by @zeroindex-ai/eval-pack." />
  <meta name="robots" content="index, follow" />

  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png" />
  <link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png" />
  <link rel="apple-touch-icon" href="/favicon-180x180.png" />

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />

  <link rel="stylesheet" href="/styles/zeroindex.css" />
</head>
<body>
  <a href="#main-content" class="skip-link">Skip to content</a>

  <header class="site-header">
    <div class="max-w-6xl mx-auto px-6 md:px-10">
      <div class="py-5 flex items-center justify-between border-b line">
        <a href="https://zeroindex.ai" class="brand-link" aria-label="ZeroIndex home">
          ${BRAND_SVG_INLINE}
          <span class="brand-name">ZeroIndex</span>
        </a>
        <a href="/" class="btn-primary">
          <span aria-hidden="true">&larr;</span>
          All evals
        </a>
      </div>
    </div>
  </header>

  <div class="max-w-6xl mx-auto px-6 md:px-10">
    <main id="main-content" class="report-shell">
      <div class="label">Eval Report</div>
      ${bodyContent}
    </main>

    <footer class="border-t line py-10 text-sm">
      <div class="muted flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div class="mono">&copy; 2026 ZeroIndex LLC &middot; Pennsylvania</div>
        <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
          <a class="subtle" href="https://github.com/zeroindex-ai/evals-site">Source</a>
          <a class="subtle" href="mailto:hello@zeroindex.ai" target="_blank" rel="noopener noreferrer">hello@zeroindex.ai</a>
          <a class="subtle" href="https://zeroindex.ai">zeroindex.ai</a>
        </div>
      </div>
    </footer>
  </div>
</body>
</html>`;
}

function extractBody(html: string): string {
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/);
  return m && m[1] !== undefined ? m[1].trim() : html;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { in: input, out: output, project, threshold } = args;
  if (!input || !output || !project) {
    console.error(
      'Usage: pnpm render --in <path.json|path.html> --out <path.html> --project <name> [--threshold <0..1>] [--redact-answers]'
    );
    process.exit(2);
    return;
  }

  const raw = await readFile(input, 'utf-8');
  const isHtml = input.endsWith('.html');

  let inner: string;
  let report: RunReport | undefined;

  if (isHtml) {
    // Migration path: a previously generated HTML file gets re-wrapped through the new shell.
    inner = raw;
  } else {
    report = JSON.parse(raw) as RunReport;
    inner = renderHtml(report, {
      projectName: project,
      ...(threshold !== undefined ? { threshold } : {}),
    });
  }

  const html = wrapWithSiteShell(inner, project, { redactAnswers: args.redactAnswers });
  // Create the parent dir so a brand-new project (e.g. its first publish) works
  // without the dir pre-existing.
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, html);

  if (report) {
    const passed = report.results.filter((r) => r.pass).length;
    const total = report.results.length;
    const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
    console.log(`Wrote ${output} — ${passed}/${total} passed (${pct}%)`);
  } else {
    console.log(`Re-wrapped ${output} with ZeroIndex site shell`);
  }
}

// Only run main() when executed directly, not when imported by tests.
const entry = process.argv[1];
if (entry && (entry.endsWith('/render.ts') || entry.endsWith('\\render.ts'))) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
