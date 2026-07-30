import { promises as fs } from "node:fs";
import path from "node:path";
import type { ScannerConfig } from "../config.js";

export type ScanArtifacts = {
  outDir: string;
  markdownPath: string;
  metaPath: string;
};

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "scan"
  );
}

export async function prepareOutDir(
  cfg: ScannerConfig,
  targetName?: string,
): Promise<ScanArtifacts> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = slugify(targetName ?? path.basename(cfg.target));
  const dir = path.join(cfg.outDir, `${base}-${stamp}`);
  await fs.mkdir(dir, { recursive: true });
  return {
    outDir: dir,
    markdownPath: path.join(dir, "report.md"),
    metaPath: path.join(dir, "meta.json"),
  };
}

export async function writeFinalArtifacts(options: {
  artifacts: ScanArtifacts;
  cfg: ScannerConfig;
  modelLabel: string;
  markdownReport: string;
  durationMs: number;
}): Promise<void> {
  const { artifacts, cfg, modelLabel, markdownReport, durationMs } = options;
  await fs.writeFile(artifacts.markdownPath, markdownReport, "utf8");
  await fs.writeFile(
    artifacts.metaPath,
    JSON.stringify(
      {
        target: cfg.target,
        outDir: artifacts.outDir,
        baseUrl: cfg.llmBaseUrl,
        model: modelLabel,
        provider: cfg.provider,
        reasoning: cfg.thinkingLevel,
        usingFreeLlm: cfg.usingFreeLlm,
        sengineConfigured: cfg.sengineConfigured,
        durationMs,
        reportMd: artifacts.markdownPath,
      },
      null,
      2,
    ),
    "utf8",
  );
}
