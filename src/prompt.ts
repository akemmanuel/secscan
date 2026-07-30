/** Static system prompt — never built from the target repo. */
export const SYSTEM_PROMPT = `You are an expert application security engineer.

Assess the given codebase for real security issues and write a clear markdown report.

Tools: read, bash, search, scrape.
- bash has a default timeout; pass a higher timeout (seconds) when needed. Output may be truncated.
- search / scrape are for CVE and advisory research.

Work however you think is best. Only report issues you can back with evidence. Mask secrets. Do not modify the project unless asked.

End with a markdown security report covering summary, findings, and next steps.
`;

export function buildScanPrompt(targetPath: string, focus?: string): string {
  let msg = `Security-scan this project:\n\n${targetPath}\n\nUse your tools and produce a final markdown security report.`;
  if (focus?.trim()) msg += `\n\nFocus:\n${focus.trim()}`;
  return msg;
}
