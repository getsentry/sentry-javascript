# CLI Reference

## Usage

```
dotagents [--user] <command> [options]
```

### Global Flags

| Flag | Description |
|------|-------------|
| `--user` | Operate on user scope (`~/.agents/`) instead of current project |
| `--help`, `-h` | Show help |
| `--version`, `-V` | Show version |

## Commands

### `init`

Initialize a new project with `agents.toml` and `.agents/` directory. Automatically includes the `dotagents` skill from `getsentry/dotagents` for CLI guidance, and attempts to install it.

```bash
dotagents init
dotagents init --agents claude,cursor
dotagents init --force
dotagents --user init
```

| Flag | Description |
|------|-------------|
| `--agents <list>` | Comma-separated agent targets (claude, cursor, codex, vscode, opencode) |
| `--force` | Overwrite existing `agents.toml` |

**Interactive mode** (when TTY is available):
1. Select agents (multiselect)
2. Manage `.gitignore` for installed skills?
3. Trust policy: allow all sources or restrict to trusted
4. If restricted: enter trusted GitHub orgs/repos (comma-separated)

### `install`

Install all skill dependencies declared in `agents.toml`.

```bash
dotagents install
dotagents install --frozen
dotagents install --force
```

| Flag | Description |
|------|-------------|
| `--frozen` | Fail if lockfile is missing or out of sync; do not modify lockfile |
| `--force` | Ignore locked commits and resolve all skills to latest refs |

**Workflow:**
1. Load config and lockfile
2. Expand wildcard entries (discover all skills from source)
3. Validate trust for each skill source
4. Resolve skills (use locked commits when available)
5. Copy skills into `.agents/skills/<name>/`
6. Write/update lockfile with integrity hashes
7. Generate `.agents/.gitignore` (if `gitignore = true`)
8. Create/verify agent symlinks
9. Write MCP and hook configs

### `add <specifier> [skill...]`

Add one or more skill dependencies and install them.

```bash
dotagents add getsentry/skills                          # Interactive selection if multiple skills
dotagents add getsentry/skills find-bugs                # Add by positional name
dotagents add getsentry/skills find-bugs code-review    # Add multiple skills at once
dotagents add getsentry/skills --name find-bugs         # Add by --name flag
dotagents add getsentry/skills --skill find-bugs        # --skill is an alias for --name
dotagents add getsentry/skills --all                    # Add all as wildcard
dotagents add getsentry/warden@v1.0.0                   # Pinned ref (inline)
dotagents add getsentry/skills --ref v2.0.0             # Pinned ref (flag)
dotagents add git:https://git.corp.dev/team/skills      # Non-GitHub git URL
dotagents add path:./my-skills/custom                   # Local path
```

| Flag | Description |
|------|-------------|
| `--name <name>` | Specify which skill to add (repeatable; alias: `--skill`) |
| `--skill <name>` | Alias for `--name` (repeatable) |
| `--ref <ref>` | Pin to a specific tag, branch, or commit |
| `--all` | Add all skills from the source as a wildcard entry (`name = "*"`) |

**Specifier formats:**
- `owner/repo` -- GitHub shorthand
- `owner/repo@ref` -- GitHub with pinned ref
- `https://github.com/owner/repo` -- GitHub HTTPS URL
- `git@github.com:owner/repo.git` -- GitHub SSH URL
- `git:https://...` -- Non-GitHub git URL
- `path:../relative` -- Local filesystem path

When a repo contains multiple skills, dotagents auto-discovers them. If only one skill is found, it's added automatically. If multiple are found and no names are given, an interactive picker is shown (TTY) or skills are listed (non-TTY).

When adding multiple skills, already-existing entries are skipped with a warning. An error is only raised if all specified skills already exist.

`--all` and `--name`/positional args are mutually exclusive.

### `remove <name>`

Remove a skill dependency.

```bash
dotagents remove find-bugs
```

Removes from `agents.toml`, deletes `.agents/skills/<name>/`, updates lockfile, and regenerates `.gitignore`.

For skills sourced from a wildcard entry (`name = "*"`), interactively prompts whether to add the skill to the wildcard's `exclude` list. If declined, the removal is cancelled.

### `update [name]`

Update skills to their latest versions.

```bash
dotagents update           # Update all
dotagents update find-bugs # Update one
```

Skips skills pinned to immutable commits (40-char SHAs). For wildcard entries, re-discovers all skills in the source -- adds new ones, removes deleted ones. Prints changelog showing old and new commits.

### `sync`

Reconcile project state: adopt orphans, verify integrity, repair symlinks and configs.

```bash
dotagents sync
```

**Actions performed:**
1. Adopt orphaned skills (installed but not declared in config)
2. Regenerate `.agents/.gitignore`
3. Check for missing skills
4. Verify integrity hashes
5. Repair agent symlinks
6. Verify/repair MCP configs
7. Verify/repair hook configs

Reports issues as warnings (modified skills, missing MCP/hook configs) or errors (missing skills).

### `list`

Show installed skills and their status.

```bash
dotagents list
dotagents list --json
```

| Flag | Description |
|------|-------------|
| `--json` | Output as JSON |

**Status indicators:**
- `✓` ok -- installed, integrity matches
- `~` modified -- locally modified since install
- `✗` missing -- in config but not installed
- `?` unlocked -- installed but not in lockfile

Skills from wildcard entries are marked with a wildcard indicator.

### `mcp`

Manage MCP (Model Context Protocol) server declarations in `agents.toml`.

#### `mcp add <name>`

Add an MCP server declaration.

```bash
dotagents mcp add github --command npx --args -y --args @modelcontextprotocol/server-github --env GITHUB_TOKEN
dotagents mcp add remote-api --url https://mcp.example.com/sse --header "Authorization:Bearer token"
```

| Flag | Description |
|------|-------------|
| `--command <cmd>` | Command to run (stdio transport) |
| `--args <arg>` | Command arguments (repeatable) |
| `--url <url>` | HTTP endpoint URL (HTTP transport) |
| `--header <Key:Value>` | HTTP headers (repeatable) |
| `--env <VAR>` | Environment variable names to pass through (repeatable) |

Either `--command` or `--url` is required (mutually exclusive).

#### `mcp remove <name>`

Remove an MCP server declaration.

```bash
dotagents mcp remove github
```

#### `mcp list`

Show declared MCP servers.

```bash
dotagents mcp list
dotagents mcp list --json
```

| Flag | Description |
|------|-------------|
| `--json` | Output as JSON |
