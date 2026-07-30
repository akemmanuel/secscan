import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";

const MAX_MARKDOWN_CHARS = 12_000;

function resolveSengine() {
  const apiKey =
    process.env.SENGINE_API_KEY?.trim() ||
    process.env.SECSCAN_SENGINE_API_KEY?.trim();
  const baseUrl = (
    process.env.SENGINE_BASE?.trim() ||
    process.env.SECSCAN_SENGINE_BASE?.trim() ||
    ""
  ).replace(/\/$/, "");

  if (!baseUrl) {
    throw new Error(
      "SENGINE_BASE is not set. Point it at a Sengine-compatible API base (e.g. https://host.example/api).",
    );
  }
  if (!apiKey) {
    throw new Error("SENGINE_API_KEY is not set");
  }
  return { apiKey, baseUrl };
}

async function getJson(pathWithQuery: string, signal?: AbortSignal): Promise<unknown> {
  const { apiKey, baseUrl } = resolveSengine();
  const res = await fetch(`${baseUrl}${pathWithQuery}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    signal,
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Sengine HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  if (!res.ok) throw new Error(`Sengine HTTP ${res.status}: ${text.slice(0, 300)}`);
  return json;
}

export function createSearchTool() {
  return defineTool({
    name: "search",
    label: "search",
    description: "Web search (Sengine). Good for CVEs, advisories, docs.",
    parameters: Type.Object({
      q: Type.String({ description: "Query" }),
      limit: Type.Optional(Type.Number({ description: "1-10, default 5" })),
    }),
    execute: async (_id, params, signal) => {
      const limit = Math.min(Math.max(1, Math.floor(params.limit || 5)), 10);
      const result = await getJson(
        `/search?q=${encodeURIComponent(params.q)}&limit=${limit}`,
        signal,
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        details: result as Record<string, unknown>,
      };
    },
  });
}

export function createScrapeTool() {
  return defineTool({
    name: "scrape",
    label: "scrape",
    description: "Fetch a public http(s) URL as markdown (Sengine).",
    parameters: Type.Object({
      url: Type.String({ description: "http(s) URL" }),
    }),
    execute: async (_id, params, signal) => {
      const u = new URL(params.url);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        throw new Error("Only http/https URLs supported");
      }
      const result = (await getJson(
        `/scrape?url=${encodeURIComponent(u.toString())}`,
        signal,
      )) as { markdown?: string; [k: string]: unknown };
      if (typeof result.markdown === "string" && result.markdown.length > MAX_MARKDOWN_CHARS) {
        result.markdown =
          result.markdown.slice(0, MAX_MARKDOWN_CHARS) +
          `\n\n[truncated to ${MAX_MARKDOWN_CHARS} chars]`;
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  });
}

export async function sengineSearch(q: string, limit = 5, signal?: AbortSignal) {
  const capped = Math.min(Math.max(1, Math.floor(limit || 5)), 10);
  return getJson(`/search?q=${encodeURIComponent(q)}&limit=${capped}`, signal);
}

export async function sengineScrape(url: string, signal?: AbortSignal) {
  return getJson(`/scrape?url=${encodeURIComponent(url)}`, signal);
}

export function resolveSengineConfig() {
  return resolveSengine();
}
