import { spawn } from "node:child_process";
import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";

export type BashToolLimits = {
  defaultTimeoutSec: number;
  maxTimeoutSec: number;
  outputLimitBytes: number;
};

export const DEFAULT_BASH_LIMITS: BashToolLimits = {
  defaultTimeoutSec: 120,
  maxTimeoutSec: 1800,
  outputLimitBytes: 5 * 1024,
};

function truncateOutput(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const buf = Buffer.from(text, "utf8");
  if (buf.byteLength <= maxBytes) return { text, truncated: false };
  let start = buf.byteLength - maxBytes;
  while (start < buf.byteLength && (buf[start]! & 0xc0) === 0x80) start++;
  return {
    text:
      `[truncated to last ${maxBytes}B of ${buf.byteLength}]\n` +
      buf.subarray(start).toString("utf8"),
    truncated: true,
  };
}

function resolveTimeoutSec(timeout: number | undefined, limits: BashToolLimits): number {
  if (timeout === undefined || timeout === null || Number.isNaN(timeout)) {
    return limits.defaultTimeoutSec;
  }
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new Error("timeout must be a positive number of seconds");
  }
  return Math.min(Math.floor(timeout), limits.maxTimeoutSec);
}

export async function runBash(
  command: string,
  cwd: string,
  options?: { timeoutSec?: number; signal?: AbortSignal; limits?: BashToolLimits },
): Promise<{
  exitCode: number | null;
  stdout: string;
  timedOut: boolean;
  truncated: boolean;
  timeoutSec: number;
}> {
  const limits = options?.limits ?? DEFAULT_BASH_LIMITS;
  const timeoutSec = resolveTimeoutSec(options?.timeoutSec, limits);
  const signal = options?.signal;
  if (signal?.aborted) throw new Error("Command aborted before start");

  return await new Promise((resolve, reject) => {
    const child = spawn("/bin/bash", ["-lc", command], {
      cwd,
      env: { ...process.env, CI: process.env.CI ?? "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutSec * 1000);
    const onAbort = () => child.kill("SIGKILL");
    signal?.addEventListener("abort", onAbort, { once: true });

    const absorb = (kind: "o" | "e", chunk: Buffer) => {
      if (kind === "o") stdout += chunk.toString("utf8");
      else stderr += chunk.toString("utf8");
      const cap = limits.outputLimitBytes * 4;
      if (Buffer.byteLength(stdout, "utf8") > cap) {
        stdout = truncateOutput(stdout, limits.outputLimitBytes * 2).text;
      }
      if (Buffer.byteLength(stderr, "utf8") > cap) {
        stderr = truncateOutput(stderr, limits.outputLimitBytes * 2).text;
      }
    };

    child.stdout?.on("data", (c: Buffer) => absorb("o", c));
    child.stderr?.on("data", (c: Buffer) => absorb("e", c));
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (signal?.aborted) {
        reject(new Error("Command aborted"));
        return;
      }
      const combined = [stdout && `STDOUT:\n${stdout}`, stderr && `STDERR:\n${stderr}`]
        .filter(Boolean)
        .join("\n\n");
      const { text, truncated } = truncateOutput(combined || "(no output)", limits.outputLimitBytes);
      resolve({ exitCode: code, stdout: text, timedOut, truncated, timeoutSec });
    });
  });
}

export function createLimitedBashTool(cwd: string, limits: BashToolLimits = DEFAULT_BASH_LIMITS) {
  return defineTool({
    name: "bash",
    label: "bash",
    description: `Run a bash command in ${cwd}. Default timeout ${limits.defaultTimeoutSec}s (override with timeout, max ${limits.maxTimeoutSec}s). Output capped at ${limits.outputLimitBytes} bytes.`,
    parameters: Type.Object({
      command: Type.String({ description: "Command to run" }),
      timeout: Type.Optional(
        Type.Number({
          description: `Timeout seconds (default ${limits.defaultTimeoutSec})`,
        }),
      ),
    }),
    execute: async (_id, params, signal) => {
      const result = await runBash(params.command, cwd, {
        timeoutSec: params.timeout,
        signal,
        limits,
      });
      const meta = [
        `exit=${result.exitCode ?? "null"}`,
        `timeout=${result.timeoutSec}s`,
        result.timedOut ? "TIMED_OUT" : "",
        result.truncated ? "TRUNCATED" : "",
      ]
        .filter(Boolean)
        .join(" | ");
      return {
        content: [{ type: "text" as const, text: `${result.stdout}\n\n[${meta}]` }],
        details: result,
      };
    },
  });
}
