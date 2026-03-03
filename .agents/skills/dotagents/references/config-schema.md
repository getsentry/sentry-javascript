# agents.toml Configuration Schema

## Top-Level Structure

```toml
version = 1                     # Required, must be 1
gitignore = true                # Optional, default true
agents = ["claude", "cursor"]   # Optional, agent targets

[project]                       # Optional
[trust]                         # Optional
[[skills]]                      # Optional, array of skill entries
[[mcp]]                         # Optional, array of MCP servers
[[hooks]]                       # Optional, array of hook declarations
```

## Top-Level Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `version` | integer | Yes | -- | Schema version, must be `1` |
| `gitignore` | boolean | No | `true` | Generate `.agents/.gitignore` for managed skills. |
| `agents` | string[] | No | `[]` | Agent targets: `claude`, `cursor`, `codex`, `vscode`, `opencode` |

## Project Section

```toml
[project]
name = "my-project"             # Optional, display name
```

## Symlinks Section

```toml
[symlinks]
targets = [".claude", ".cursor"]  # Legacy: explicit symlink targets
```

When `agents` is set, symlink targets are derived automatically. The `[symlinks]` section is for backward compatibility.

## Skills Section

### Regular Skills

```toml
[[skills]]
name = "find-bugs"              # Required, unique skill identifier
source = "getsentry/skills"     # Required, skill source
ref = "v1.0.0"                  # Optional, pin to tag/branch/commit
path = "tools/my-skill"         # Optional, subdirectory within repo
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique identifier. Pattern: `^[a-zA-Z0-9][a-zA-Z0-9._-]*$` |
| `source` | string | Yes | `owner/repo`, `owner/repo@ref`, `git:url`, or `path:relative` |
| `ref` | string | No | Tag, branch, or commit SHA to pin |
| `path` | string | No | Subdirectory containing the skill within the source repo |

### Wildcard Skills

```toml
[[skills]]
name = "*"                      # Wildcard: install all skills from source
source = "getsentry/skills"     # Required
ref = "v1.0.0"                  # Optional
exclude = ["deprecated-skill"]  # Optional, skills to skip
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | literal `"*"` | Yes | Wildcard marker |
| `source` | string | Yes | Same formats as regular skills |
| `ref` | string | No | Tag, branch, or commit SHA to pin |
| `exclude` | string[] | No | Skill names to skip. Default: `[]` |

## Trust Section

```toml
[trust]
allow_all = true                    # Allow any source

# OR restrict to specific sources:
[trust]
github_orgs = ["getsentry"]         # GitHub org names
github_repos = ["ext-org/repo"]     # Exact owner/repo pairs
git_domains = ["git.corp.example.com"]  # Git URL domains
```

| Field | Type | Description |
|-------|------|-------------|
| `allow_all` | boolean | Allow all sources (overrides other fields) |
| `github_orgs` | string[] | Allowed GitHub organizations |
| `github_repos` | string[] | Allowed exact `owner/repo` pairs |
| `git_domains` | string[] | Allowed domains for `git:` URLs |

No `[trust]` section = allow all sources (backward compatible).

## MCP Section

### Stdio Transport

```toml
[[mcp]]
name = "github"                     # Required, unique server name
command = "npx"                     # Required for stdio
args = ["-y", "@modelcontextprotocol/server-github"]  # Optional
env = ["GITHUB_TOKEN"]             # Optional, env vars to pass through
```

### HTTP Transport

```toml
[[mcp]]
name = "remote-api"                 # Required, unique server name
url = "https://mcp.example.com/sse" # Required for HTTP
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique server identifier |
| `command` | string | Stdio only | Command to execute |
| `args` | string[] | No | Command arguments |
| `env` | string[] | No | Environment variable names to pass through |
| `url` | string | HTTP only | Server URL |
| `headers` | table | No | HTTP headers |

## Hooks Section

```toml
[[hooks]]
event = "PreToolUse"                # Required
matcher = "Bash"                    # Optional, tool name filter
command = "my-lint-check"           # Required
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `event` | string | Yes | `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop` |
| `matcher` | string | No | Tool name to match (omit for all tools) |
| `command` | string | Yes | Shell command to execute |

## Lockfile (agents.lock)

Auto-generated. Do not edit manually.

```toml
version = 1

[skills.find-bugs]
source = "getsentry/skills"
resolved_url = "https://github.com/getsentry/skills.git"
resolved_path = "plugins/sentry-skills/skills/find-bugs"
resolved_ref = "v1.0.0"
commit = "c8881564e75eff4faaecc82d1c3f13356851b6e7"
integrity = "sha256-FWmCLdOj+x+XffiEg7Bx19drylVypeKz8me9OA757js="
```

| Field | Type | Description |
|-------|------|-------------|
| `source` | string | Original source from `agents.toml` |
| `resolved_url` | string | Resolved git URL |
| `resolved_path` | string | Subdirectory within repo |
| `resolved_ref` | string | Ref that was resolved (omitted for default branch) |
| `commit` | string | Full 40-char SHA of resolved commit |
| `integrity` | string | `sha256-` prefixed base64 content hash |

Local path skills have `source` and `integrity` only (no commit).

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `DOTAGENTS_STATE_DIR` | Override cache location (default: `~/.local/dotagents`) |
| `DOTAGENTS_HOME` | Override user-scope location (default: `~/.agents`) |
