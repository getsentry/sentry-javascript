# Configuration (agents.toml)

See [config-schema.md](config-schema.md) for the complete schema reference.

## Minimal Example

```toml
version = 1
agents = ["claude"]

[[skills]]
name = "find-bugs"
source = "getsentry/skills"
```

## Skills

Each skill requires `name` and `source`. Optionally pin with `ref` or specify a subdirectory with `path`.

```toml
[[skills]]
name = "find-bugs"
source = "getsentry/skills"
ref = "v1.0.0"
path = "plugins/sentry-skills/skills/find-bugs"
```

**Source formats:**

| Format | Example | Resolves to |
|--------|---------|-------------|
| GitHub shorthand | `getsentry/skills` | `https://github.com/getsentry/skills.git` |
| GitHub pinned | `getsentry/skills@v1.0.0` | Same, checked out at `v1.0.0` |
| GitHub HTTPS | `https://github.com/owner/repo` | URL used directly |
| GitHub SSH | `git@github.com:owner/repo.git` | SSH clone |
| Git URL | `git:https://git.corp.dev/team/skills` | Any non-GitHub git remote |
| Local | `path:./my-skills/custom` | Relative to project root |

**Skill name rules:** Must start with alphanumeric, contain only `[a-zA-Z0-9._-]`.

### Wildcard Skills

Add all skills from a source with a single entry:

```toml
[[skills]]
name = "*"
source = "getsentry/skills"
exclude = ["deprecated-skill"]
```

During `install` and `update`, dotagents discovers all skills in the source and installs each one (except those in `exclude`). Each skill gets its own lockfile entry. Use `dotagents add <source> --all` to create a wildcard entry from the CLI.

## Trust

Restrict which sources are allowed. Without a `[trust]` section, all sources are allowed.

```toml
# Allow all sources explicitly
[trust]
allow_all = true
```

```toml
# Restrict to specific GitHub orgs and repos
[trust]
github_orgs = ["getsentry"]
github_repos = ["external-org/specific-repo"]
git_domains = ["git.corp.example.com"]
```

- GitHub sources match against `github_orgs` (by owner) or `github_repos` (exact owner/repo)
- Git URL sources match against `git_domains`
- Local `path:` sources are always allowed
- A source passes if it matches any rule (org OR repo OR domain)

Trust is validated before any network operations in `add` and `install`.

## MCP Servers

Declare MCP servers that get written to each agent's config.

```toml
# Stdio transport
[[mcp]]
name = "github"
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]
env = ["GITHUB_TOKEN"]

# HTTP transport
[[mcp]]
name = "remote-api"
url = "https://mcp.example.com/sse"
headers = { Authorization = "Bearer token" }
```

MCP configs are written per-agent in the appropriate format:
- Claude: `.mcp.json` (JSON)
- Cursor: `.cursor/mcp.json` (JSON)
- Codex: `.codex/config.toml` (TOML, shared with other Codex config)
- VS Code: `.vscode/mcp.json` (JSON)
- OpenCode: `opencode.json` (JSON, shared)

## Hooks

Declare hooks for agent tool events.

```toml
[[hooks]]
event = "PreToolUse"
matcher = "Bash"
command = "my-lint-check"
```

**Supported events:** `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`

Hook configs are written per-agent:
- Claude: `.claude/settings.json` (merged into existing file)
- Cursor: `.cursor/hooks.json` (dedicated file, events mapped to Cursor equivalents)
- VS Code: `.claude/settings.json` (same file as Claude)
- Codex/OpenCode: not supported (warnings emitted during install/sync)

**Cursor event mapping:**
- `PreToolUse` -> `beforeShellExecution` + `beforeMCPExecution`
- `PostToolUse` -> `afterFileEdit`
- `UserPromptSubmit` -> `beforeSubmitPrompt`
- `Stop` -> `stop`

## Agents

The `agents` array controls which agent tools get symlinks and configs.

```toml
agents = ["claude", "cursor", "codex", "vscode", "opencode"]
```

Each agent gets:
- A `<agent-dir>/skills/` symlink pointing to `.agents/skills/` (Claude, Cursor)
- Or native discovery from `.agents/skills/` (Codex, VS Code, OpenCode)
- MCP server configs in the agent's config file
- Hook configs (where supported)

## Scopes

### Project Scope (default)

Operates on the current project. Requires `agents.toml` at the project root.

### User Scope (`--user`)

Operates on `~/.agents/` for skills shared across all projects. Override with `DOTAGENTS_HOME`.

```bash
dotagents --user init
dotagents --user add getsentry/skills --all
```

User-scope symlinks go to `~/.claude/skills/` and `~/.cursor/skills/`.

When no `agents.toml` exists and you're not inside a git repo, dotagents falls back to user scope automatically.

## Gitignore

When `gitignore = true` (schema default), dotagents generates `.agents/.gitignore` listing managed (remote) skills. In-place skills (`path:.agents/skills/...`) are never gitignored since they must be tracked in git.

When `gitignore = false`, no gitignore is created -- skills are checked into the repository. Anyone cloning gets skills without running `install`.

## Caching

- Cache location: `~/.local/dotagents/` (override with `DOTAGENTS_STATE_DIR`)
- Unpinned repos: cached with 24-hour TTL
- Pinned refs (40-char SHA): cached immutably, never re-fetched
- Use `dotagents install --force` to bypass cache

## Troubleshooting

**Skills not installing:**
- Check `agents.toml` syntax with `dotagents list`
- Verify source is accessible (`git clone` the URL manually)
- Check trust config if using restricted mode

**Symlinks broken:**
- Run `dotagents sync` to repair

**Integrity mismatch:**
- Skill was modified locally -- run `dotagents install --force` to restore
- Or run `dotagents sync` to detect and report issues
