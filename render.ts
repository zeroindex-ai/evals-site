// Render a saved RunReport JSON into a single self-contained HTML file.
//
// Usage: pnpm render --in <path.json> --out <path.html> --project <name> [--threshold <0..1>]
//
// The input JSON is whatever `runEval` persisted (run-<timestamp>.json). The
// output is dropped wherever --out points; commit it to evals-site and push.

import { readFile, writeFile } from 'node:fs/promises';
import { renderHtml } from '@zeroindex-ai/eval-pack/report-html';
import type { RunReport } from '@zeroindex-ai/eval-pack';

type Args = { in?: string; out?: string; project?: string; threshold?: number };

function parseArgs(argv: string[]): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const v = argv[i + 1];
    if (a === '--in') {
      out.in = v;
      i++;
    } else if (a === '--out') {
      out.out = v;
      i++;
    } else if (a === '--project') {
      out.project = v;
      i++;
    } else if (a === '--threshold') {
      out.threshold = Number(v);
      i++;
    } else {
      throw new Error(`Unknown flag: ${a}`);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.in || !args.out || !args.project) {
    console.error(
      'Usage: pnpm render --in <path.json> --out <path.html> --project <name> [--threshold <0..1>]',
    );
    process.exit(2);
  }

  const raw = await readFile(args.in, 'utf-8');
  const report = JSON.parse(raw) as RunReport;

  const html = renderHtml(report, {
    projectName: args.project,
    ...(args.threshold !== undefined ? { threshold: args.threshold } : {}),
  });

  await writeFile(args.out, html);
  const passed = report.results.filter((r) => r.pass).length;
  const total = report.results.length;
  console.log(
    `Wrote ${args.out} — ${passed}/${total} passed (${total > 0 ? Math.round((passed / total) * 100) : 0}%)`,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
