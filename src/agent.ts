import { getModel } from "@earendil-works/pi-ai/compat";
import type { Model } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  createReadToolDefinition,
  DefaultResourceLoader,
  getAgentDir,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { ScannerConfig } from "./config.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { createLimitedBashTool } from "./tools/bash.js";
import { createScrapeTool, createSearchTool } from "./tools/sengine.js";

export type ScannerSession = {
  session: AgentSession;
  modelLabel: string;
  dispose: () => void;
};

function withBaseUrl(model: Model<any>, baseUrl: string): Model<any> {
  if (!baseUrl || model.baseUrl === baseUrl) return model;
  return { ...model, baseUrl };
}

export async function createSecurityScanner(cfg: ScannerConfig): Promise<ScannerSession> {
  const cwd = cfg.target;

  const modelRuntime = await ModelRuntime.create();
  modelRuntime.setRuntimeApiKey(cfg.provider, cfg.openCodeApiKey);

  const found =
    modelRuntime.getModel(cfg.provider, cfg.modelId) ??
    getModel(cfg.provider as never, cfg.modelId as never);

  if (!found) {
    const available = modelRuntime.getModels(cfg.provider).map((m) => m.id);
    throw new Error(
      `Model ${cfg.provider}/${cfg.modelId} not found. Known: ${available.slice(0, 16).join(", ")}...`,
    );
  }

  const model = withBaseUrl(found, cfg.llmBaseUrl);

  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: true },
    retry: { enabled: true, maxRetries: 2 },
  });

  const tools = [
    createReadToolDefinition(cwd),
    createLimitedBashTool(cwd, {
      defaultTimeoutSec: cfg.bashTimeoutSec,
      maxTimeoutSec: cfg.bashMaxTimeoutSec,
      outputLimitBytes: cfg.bashOutputLimitBytes,
    }),
    createSearchTool(),
    createScrapeTool(),
  ] as ToolDefinition[];

  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPromptOverride: () => SYSTEM_PROMPT,
    appendSystemPromptOverride: () => [],
    agentsFilesOverride: () => ({ agentsFiles: [] }),
  });
  await loader.reload();

  const { session } = await createAgentSession({
    cwd,
    model,
    thinkingLevel: cfg.thinkingLevel,
    modelRuntime,
    resourceLoader: loader,
    settingsManager,
    sessionManager: SessionManager.inMemory(cwd),
    noTools: "all",
    tools: ["read", "bash", "search", "scrape"],
    customTools: tools,
  });

  return {
    session,
    modelLabel: `${model.provider}/${model.id}`,
    dispose: () => session.dispose(),
  };
}
