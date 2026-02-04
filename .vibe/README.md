# Mistral Vibe Configuration for Sentry JavaScript SDK

This directory contains optimized Mistral Vibe settings for working with the Sentry JavaScript SDK monorepo.

## Configuration Overview

### Main Configuration (`config.toml`)

- **Model**: `devstral-2` - Fast, cost-effective model optimized for coding
- **System Prompt**: Custom `sentry-sdk` prompt with repository-specific context
- **Skills**: Loads from `.claude/skills` directory
- **Session Logging**: Enabled in `.vibe/logs/` for debugging and continuation
- **Tool Permissions**: Balanced defaults requiring approval for writes/commands

## Custom Agents

Use specialized agents for different workflows with the `--agent` flag.

### Code Review Agent

**Usage**: `vibe --agent code-review`

- **Purpose**: Read-only code analysis and review
- **Permissions**: Auto-approves read operations, disables writes
- **Best for**: Reviewing PRs, analyzing code quality, exploring codebase

### Refactoring Agent

**Usage**: `vibe --agent refactor`

- **Purpose**: Automated code refactoring
- **Permissions**: Auto-approves file edits, requires approval for shell commands
- **Best for**: Renaming variables, restructuring code, applying patterns

### Testing Agent

**Usage**: `vibe --agent testing`

- **Purpose**: Running and analyzing tests
- **Permissions**: Auto-approves bash commands for tests, requires approval for edits
- **Best for**: Running test suites, debugging test failures, coverage analysis

## Quick Start Examples

```bash
# Start interactive session with default settings
vibe

# Use code review agent to analyze a file
vibe --agent code-review "Review the changes in packages/core/src/client.ts"

# Use refactoring agent for automated refactoring
vibe --agent refactor "Rename all instances of 'getCwd' to 'getCurrentWorkingDirectory'"

# Use testing agent to run tests
vibe --agent testing "Run tests for the @sentry/browser package"

# Continue from last session
vibe --continue

# Resume specific session
vibe --resume abc123
```

## Tool Permissions Reference

| Tool           | Default | Code Review | Refactor | Testing |
| -------------- | ------- | ----------- | -------- | ------- |
| read_file      | always  | always      | always   | always  |
| grep           | always  | always      | always   | always  |
| list_dir       | always  | always      | always   | always  |
| write_file     | ask     | ❌          | always   | ask     |
| search_replace | ask     | ❌          | always   | ask     |
| bash           | ask     | ❌          | ask      | always  |
| todo           | always  | always      | always   | always  |

## Resources

- [Mistral Vibe Documentation](https://github.com/mistralai/mistral-vibe)
- [Sentry SDK Development Rules](../CLAUDE.md)
- [Git Flow Strategy](../docs/gitflow.md)
