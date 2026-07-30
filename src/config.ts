import path from "node:path";
import { loadDotEnv } from "./env.js";

export const FREE_QUOTA_KEY = "public";
export const DEFAULT_PROVIDER = "opencode";
export const DEFAULT_MODEL_ID = "deepseek-v4-flash-free";
export const DEFAULT_LLM_BASE_URL = "https://opencode.ai/zen/v1";

export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high";

export type ScannerConfig = {
  target: string;
  appRoot: string;
  outDir: string;
  provider: string;
  modelId: string;
  llmBaseUrl: string;
  thinkingLevel: ThinkingLevel;
  openCodeApiKey: string;
  usingFreeLlm: boolean;
  sengineApiKey?: string;
  /** Sengine-compatible API base; only set when provided via env. */
  sengineBase?: string;
  sengineConfigured: boolean;
  bashTimeoutSec: number;
  bashOutputLimitBytes: number;
  bashMaxTimeoutSec: number;
  focus?: string;
  quiet: boolean;
};

function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

function firstEnv(...names: string[]): string | undefined {
  for (const n of names) {
    const v = env(n);
    if (v) return v;
  }
  return undefined;
}

function envBool(name: string, fallback: boolean): boolean {
  const v = env(name)?.toLowerCase();
  if (!v) return fallback;
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return fallback;
}

function envInt(name: string, fallback: number): number {
  const v = env(name);
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function envThinking(fallback: ThinkingLevel): ThinkingLevel {
  const v = firstEnv(
    "SECSCAN_REASONING",
    "SECSCAN_THINKING",
    "REASONING",
    "THINKING",
  )?.toLowerCase();
  if (v === "off" || v === "minimal" || v === "low" || v === "medium" || v === "high") {
    return v;
  }
  return fallback;
}

export type LoadConfigOptions = {
  target?: string;
  modelId?: string;
  thinkingLevel?: ThinkingLevel;
  focus?: string;
  quiet?: boolean;
  outDir?: string;
  appRoot?: string;
  llmBaseUrl?: string;
};

export function loadConfig(opts: LoadConfigOptions = {}): ScannerConfig {
  const appRoot = path.resolve(opts.appRoot ?? process.cwd());
  loadDotEnv(appRoot);

  const openCodeApiKey =
    firstEnv("OPENCODE_API_KEY", "SECSCAN_OPENCODE_API_KEY", "LLM_API_KEY") ?? FREE_QUOTA_KEY;
  const usingFreeLlm =
    !firstEnv("OPENCODE_API_KEY", "SECSCAN_OPENCODE_API_KEY", "LLM_API_KEY") ||
    openCodeApiKey === FREE_QUOTA_KEY;

  if (!process.env.OPENCODE_API_KEY) {
    process.env.OPENCODE_API_KEY = openCodeApiKey;
  }

  const sengineApiKey = firstEnv("SENGINE_API_KEY", "SECSCAN_SENGINE_API_KEY");
  const sengineBaseRaw = firstEnv("SENGINE_BASE", "SECSCAN_SENGINE_BASE");
  const sengineBase = sengineBaseRaw ? sengineBaseRaw.replace(/\/$/, "") : undefined;
  if (sengineApiKey) process.env.SENGINE_API_KEY ??= sengineApiKey;
  if (sengineBase) process.env.SENGINE_BASE ??= sengineBase;

  const bashOutputKb = envInt("SECSCAN_BASH_OUTPUT_KB", 5);

  return {
    target: path.resolve(opts.target ?? env("SECSCAN_TARGET") ?? process.cwd()),
    appRoot,
    outDir: path.resolve(
      opts.outDir ?? env("SECSCAN_OUT_DIR") ?? path.join(appRoot, "reports"),
    ),
    provider: firstEnv("SECSCAN_PROVIDER", "LLM_PROVIDER") ?? DEFAULT_PROVIDER,
    modelId:
      opts.modelId ??
      firstEnv("SECSCAN_MODEL", "OPENCODE_MODEL", "MODEL", "LLM_MODEL") ??
      DEFAULT_MODEL_ID,
    llmBaseUrl: (
      opts.llmBaseUrl ??
      firstEnv("SECSCAN_BASE_URL", "OPENCODE_BASE_URL", "LLM_BASE_URL", "BASE_URL") ??
      DEFAULT_LLM_BASE_URL
    ).replace(/\/$/, ""),
    thinkingLevel: opts.thinkingLevel ?? envThinking("low"),
    openCodeApiKey,
    usingFreeLlm,
    sengineApiKey,
    sengineBase,
    // Both base URL and API key must be supplied — no host is hardcoded.
    sengineConfigured: Boolean(sengineApiKey && sengineBase),
    bashTimeoutSec: envInt("SECSCAN_BASH_TIMEOUT", 120),
    bashOutputLimitBytes: Math.max(1024, bashOutputKb * 1024),
    bashMaxTimeoutSec: envInt("SECSCAN_BASH_MAX_TIMEOUT", 1800),
    focus: opts.focus ?? env("SECSCAN_FOCUS"),
    quiet: opts.quiet ?? envBool("SECSCAN_QUIET", false),
  };
}

export function formatConfigBanner(cfg: ScannerConfig): string {
  return [
    "secscan",
    `  target:    ${cfg.target}`,
    `  out:       ${cfg.outDir}`,
    `  llm:       ${cfg.llmBaseUrl}`,
    `  model:     ${cfg.provider}/${cfg.modelId}`,
    `  reasoning: ${cfg.thinkingLevel}`,
    `  llm auth:  ${cfg.usingFreeLlm ? `free (${FREE_QUOTA_KEY})` : "api key"}`,
    `  sengine:   ${cfg.sengineConfigured ? cfg.sengineBase : "not configured (set SENGINE_BASE + SENGINE_API_KEY)"}`,
    "",
  ].join("\n");
}
