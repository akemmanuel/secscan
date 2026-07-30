import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Minimal .env loader (no dependency). Does not override existing process.env.
 * Searches app root, cwd, and parent of cwd.
 */
export function loadDotEnv(appRoot = process.cwd()): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(appRoot, ".env"),
    path.join(process.cwd(), ".env"),
    path.join(path.dirname(appRoot), ".env"),
    // When running from dist/ or src/
    path.join(here, "..", "..", ".env"),
    path.join(here, "..", ".env"),
  ];

  const seen = new Set<string>();
  for (const file of candidates) {
    const resolved = path.resolve(file);
    if (seen.has(resolved) || !existsSync(resolved)) continue;
    seen.add(resolved);
    applyEnvFile(resolved);
  }
}

function applyEnvFile(file: string): void {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // support basic escaped newlines in double-quoted values already stripped
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
