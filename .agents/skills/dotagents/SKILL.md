---
name: dotagents
description: Manage agent skill dependencies with dotagents. Use when asked to "add a skill", "install skills", "remove a skill", "update skills", "dotagents init", "agents.toml", "agents.lock", "sync skills", "list skills", "set up dotagents", "configure trust", "add MCP server", "add hook", "wildcard skills", "user scope", or any dotagents-related task.
---

Manage agent skill dependencies declared in `agents.toml`. dotagents resolves, installs, and symlinks skills so multiple agent tools (Claude Code, Cursor, Codex, VS Code, OpenCode) discover them from `.agents/skills/`.

## References

Read the relevant reference when the task requires deeper detail:

| Document | Read When |
|----------|-----------|
| [references/cli-reference.md](references/cli-reference.md) | Full command options, flags, examples |
| [references/configuration.md](references/configuration.md) | Editing agents.toml, source formats, trust, MCP, hooks, wildcards, scopes |
| [references/config-schema.md](references/config-schema.md) | Exact field names, types, and defaults |

## Quick Start

```bash
# Initialize a new project (interactive TUI)
dotagents init

# Add a skill from GitHub
dotagents add getsentry/skills find-bugs

# Add multiple skills at once
dotagents add getsentry/skills find-bugs code-review commit

# Add all skills from a repo
dotagents add getsentry/skills --all

# Add a pinned skill
dotagents add getsentry/warden@v1.0.0

# Install all dependencies from agents.toml
dotagents install

# List installed skills
dotagents list
```

## Commands

| Command | Description |
|---------|-------------|
| `dotagents init` | Initialize `agents.toml` and `.agents/` directory |
| `dotagents install` | Install all skills from `agents.toml` |
| `dotagents add <specifier>` | Add a skill dependency |
| `dotagents remove <name>` | Remove a skill |
| `dotagents update [name]` | Update skills to latest versions |
| `dotagents sync` | Reconcile state (adopt orphans, repair symlinks, verify integrity) |
| `dotagents list` | Show installed skills and their status |
| `dotagents mcp` | Add, remove, or list MCP server declarations |

All commands accept `--user` to operate on user scope (`~/.agents/`) instead of the current project.

For full options and flags, read [references/cli-reference.md](references/cli-reference.md).

## Source Formats

| Format | Example | Description |
|--------|---------|-------------|
| GitHub shorthand | `getsentry/skills` | Owner/repo (resolves to GitHub HTTPS) |
| GitHub pinned | `getsentry/warden@v1.0.0` | With tag, branch, or commit |
| GitHub SSH | `git@github.com:owner/repo.git` | SSH clone URL |
| GitHub HTTPS | `https://github.com/owner/repo` | Full HTTPS URL |
| Git URL | `git:https://git.corp.dev/team/skills` | Any non-GitHub git remote |
| Local path | `path:./my-skills/custom` | Relative to project root |

## Key Concepts

- **`.agents/skills/`** is the canonical home for all installed skills
- **`agents.toml`** declares dependencies; **`agents.lock`** pins exact commits and integrity hashes
- **Symlinks**: `.claude/skills/`, `.cursor/skills/` point to `.agents/skills/`
- **Wildcards**: `name = "*"` installs all skills from a source, with optional `exclude` list
- **Trust**: Optional `[trust]` section restricts which sources are allowed
- **Hooks**: `[[hooks]]` declarations write tool-event hooks to each agent's config
- **Gitignore**: When `gitignore = true`, managed skills are gitignored; custom in-place skills are tracked
- **User scope**: `--user` flag manages skills in `~/.agents/` shared across all projects
