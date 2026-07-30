# secscan

AI-powered **security scanning agent**. Point it at a codebase; it explores with tools, researches CVEs when configured, and writes a markdown report.

Built on the [Pi](https://github.com/badlogic/pi-mono) coding-agent SDK, OpenCode Zen (or any compatible OpenAI-style endpoint), and optional [Sengine](https://sengine.idunara.com)-compatible web tools.

## Requirements

- Node.js **≥ 20**
- [pnpm](https://pnpm.io) 11+

## Setup

```bash
pnpm install
cp .env.example .env
# edit .env — at least LLM settings; add Sengine for search/scrape
```

### Environment

| Variable | Purpose |
|----------|---------|
| `SECSCAN_BASE_URL` | LLM API base URL |
| `SECSCAN_PROVIDER` | Provider id (default `opencode`) |
| `SECSCAN_MODEL` | Model id |
| `SECSCAN_REASONING` | Thinking level: `off` \| `minimal` \| `low` \| `medium` \| `high` |
| `OPENCODE_API_KEY` | Optional; free Zen quota is used when omitted |
| `SENGINE_BASE` | Sengine-compatible API base (no trailing slash required). **Required** for `search` / `scrape` |
| `SENGINE_API_KEY` | Bearer token for that Sengine base. **Required** for `search` / `scrape` |
| `SECSCAN_OUT_DIR` | Report root (default `./reports`) |
| `SECSCAN_BASH_TIMEOUT` | Default bash tool timeout (seconds) |
| `SECSCAN_BASH_OUTPUT_KB` | Bash output cap (KB) |

Sengine is **fully swappable**: set `SENGINE_BASE` (+ key) to whatever host you run. Nothing in secscan assumes a particular deployment URL.

## Usage

```bash
pnpm scan -- /path/to/project
```

Examples:

```bash
# Bundle fixture (intentionally insecure demo app)
pnpm scan -- ./src/fixtures/vulnerable-sample

# Real tree + focus hint
pnpm scan -- /path/to/app -f "Focus on auth and SSRF"

# Model / thinking overrides
pnpm scan -- /path/to/app -m deepseek-v4-flash-free -t medium
```

### CLI

```
pnpm scan -- <target> [options]

  -p, --path <dir>       Target path
  -o, --out <dir>        Reports directory
  -m, --model <id>       Model id
  -t, --thinking <lvl>   off|minimal|low|medium|high
  -f, --focus <text>     Extra focus for the agent
  -q, --quiet            Less tool logging on stderr
  -h, --help
```

After `pnpm build`, the `secscan` binary is available from `dist/`:

```bash
pnpm build
node dist/index.js /path/to/project
```

## How it works

secscan is an **LLM agent**, not a one-shot linter. A typical run takes minutes and streams tool activity:

| Tool | Role |
|------|------|
| `read` | Read files in the target tree |
| `bash` | Run shell commands in the target cwd (timeout + output limits) |
| `search` | Web search via your configured Sengine base |
| `scrape` | Fetch public URLs as markdown via Sengine |

Output lands in:

```text
reports/<name>-<timestamp>/report.md
reports/<name>-<timestamp>/meta.json
```

(`reports/` is gitignored.)

## Safety

- The agent can run shell commands **inside the target directory**. Only scan trees you trust, or use a sandbox.
- Reports may quote code; the system prompt asks the model to **mask secrets**.
- Do not commit real `.env` files. Use `.env.example` as the template.

## Fixture

`src/fixtures/vulnerable-sample` is a **synthetic** insecure app for demos. Embedded “secrets” are fake.

## Develop

```bash
pnpm typecheck
pnpm build
```

## License

[MIT](./LICENSE) © akemmanuel
