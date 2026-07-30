#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSecurityScanner } from "./agent.js";
import {
  formatConfigBanner,
  FREE_QUOTA_KEY,
  loadConfig,
  type ThinkingLevel,
} from "./config.js";
import { buildScanPrompt } from "./prompt.js";
import { prepareOutDir, writeFinalArtifacts } from "./report/write.js";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function printHelp(): void {
  console.log(`secscan — AI security scanning agent

Usage:
  pnpm scan -- <target> [options]

Options:
  -p, --path <dir>       Target path
  -o, --out <dir>        Reports directory
  -m, --model <id>       Model id
  -t, --thinking <lvl>   off|minimal|low|medium|high
  -f, --focus <text>     Extra focus for the agent
  -q, --quiet
  -h, --help

Env (.env):
  SECSCAN_BASE_URL / BASE_URL
  SECSCAN_MODEL / MODEL
  SECSCAN_REASONING / REASONING
  OPENCODE_API_KEY
  SENGINE_BASE           Sengine-compatible API base (required for search/scrape)
  SENGINE_API_KEY        Sengine API key (required for search/scrape)
  SECSCAN_OUT_DIR
`);
}

type Cli = {
  target?: string;
  outDir?: string;
  modelId?: string;
  thinkingLevel?: ThinkingLevel;
  focus?: string;
  quiet: boolean;
  help: boolean;
};

function parseArgs(argv: string[]): Cli {
  const cli: Cli = { quiet: false, help: false };
  const args = [...argv];
  while (args.length) {
    const a = args.shift()!;
    if (a === "--") continue;
    if (a === "-h" || a === "--help") cli.help = true;
    else if (a === "-q" || a === "--quiet") cli.quiet = true;
    else if (a === "-p" || a === "--path") cli.target = path.resolve(args.shift() ?? ".");
    else if (a === "-o" || a === "--out") cli.outDir = path.resolve(args.shift() ?? "./reports");
    else if (a === "-m" || a === "--model") cli.modelId = args.shift();
    else if (a === "-t" || a === "--thinking" || a === "--reasoning") {
      cli.thinkingLevel = args.shift() as ThinkingLevel;
    } else if (a === "-f" || a === "--focus") cli.focus = args.shift();
    else if (a.startsWith("-")) throw new Error(`Unknown option: ${a}`);
    else cli.target = path.resolve(a);
  }
  return cli;
}

function bindLogging(
  session: Awaited<ReturnType<typeof createSecurityScanner>>["session"],
  quiet: boolean,
) {
  let md = "";
  const unsub = session.subscribe((event) => {
    if (event.type === "message_update") {
      const ev = event.assistantMessageEvent;
      if (ev.type === "text_delta") {
        md += ev.delta;
        process.stdout.write(ev.delta);
      }
    } else if (event.type === "tool_execution_start" && !quiet) {
      process.stderr.write(`\n→ ${event.toolName}\n`);
    } else if (event.type === "tool_execution_end" && !quiet) {
      process.stderr.write(`← ${event.toolName} (${event.isError ? "error" : "ok"})\n`);
    } else if (event.type === "agent_end") {
      process.stdout.write("\n");
    }
  });
  return { unsubscribe: unsub, getMarkdown: () => md };
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.help) {
    printHelp();
    return;
  }

  const cfg = loadConfig({
    appRoot: APP_ROOT,
    target: cli.target,
    outDir: cli.outDir,
    modelId: cli.modelId,
    thinkingLevel: cli.thinkingLevel,
    focus: cli.focus,
    quiet: cli.quiet,
  });

  process.stderr.write(formatConfigBanner(cfg));

  const started = Date.now();
  const artifacts = await prepareOutDir(cfg, path.basename(cfg.target));
  process.stderr.write(`  run dir:   ${artifacts.outDir}\n\n`);

  const scanner = await createSecurityScanner(cfg);
  const logging = bindLogging(scanner.session, cfg.quiet);

  try {
    await scanner.session.prompt(buildScanPrompt(cfg.target, cfg.focus));
  } finally {
    logging.unsubscribe();
    scanner.dispose();
  }

  const markdown = logging.getMarkdown().trim() || "_No model output._\n";
  await writeFinalArtifacts({
    artifacts,
    cfg,
    modelLabel: scanner.modelLabel,
    markdownReport: markdown,
    durationMs: Date.now() - started,
  });

  process.stderr.write(`\nSaved:\n  ${artifacts.markdownPath}\n  ${artifacts.metaPath}\n`);
}

main().catch((err) => {
  console.error("\nScanner failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});

export { FREE_QUOTA_KEY };
