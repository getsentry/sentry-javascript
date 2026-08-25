# Sentry JavaScript SDK

Monorepo with 40+ packages in `@sentry/*`, managed with Yarn workspaces and Nx.

## Setup

- [Volta](https://volta.sh/) for Node.js/Yarn/PNPM version management
- Requires `VOLTA_FEATURE_PNPM=1`
- After cloning: `yarn install && yarn build`
- Never change Volta, Yarn, or package manager versions unless explicitly asked

### Code Intelligence

Prefer LSP over Grep/Read for code navigation — it's faster, precise, and avoids reading entire files:

- `workspaceSymbol` to find where something is defined
- `findReferences` to see all usages across the codebase
- `goToDefinition` / `goToImplementation` to jump to source
- `hover` for type info without reading the file

Use Grep only when LSP isn't available or for text/pattern searches (comments, strings, config).

After writing or editing code, check LSP diagnostics and fix errors before proceeding.

## Package Manager

Use **yarn**, never npm or pnpm. Scripts live in the root `package.json`.
`yarn build:dev:filter @sentry/<pkg>` builds one package and its deps.

Single package: `cd packages/<name> && yarn test`

## Commit Attribution

AI commits MUST include a `Co-Authored-By` line with the appropriate committer email when known:

```
Co-Authored-By: <Claude model name> <noreply@anthropic.com>
Co-Authored-By: <OpenAI/ChatGPT model name> <codex@openai.com>
Co-Authored-By: <Cursor agent name> <cursoragent@cursor.com>
```

Use the Cursor email for Cursor, even when it runs a Claude or OpenAI model. Omit the line only when there is no known committer email address for the agent.

## Git Workflow

Uses **Git Flow** (see `docs/gitflow.md`).

- **All PRs target `develop`** (NOT `master`)
- `master` = last released state — never merge directly
- Feature branches: `feat/descriptive-name`
- Never update dependencies, `package.json`, or build scripts unless explicitly asked

## Before Every Pull Request

1. `yarn format`
2. `yarn build:dev`
3. `yarn lint`
4. `yarn test`
5. NEVER push on `develop`

## Pull Requests

- **Do NOT add a "Test plan" / "Testing" checklist to PR bodies.** CI runs the full test suite on every PR — a hand-rolled checklist duplicates that signal and rots fast. Write the summary content directly and add a _Root cause_ section only if relevant.
- **Omit the "Summary" heading** in PR bodies — lead with the summary text itself, no `## Summary` header.
- Include `Fixes #<issue-number>` somewhere in the PR body so the merge auto-closes the linked issue.
- Always open PRs as draft.
- Include reasoning of changes in the PR description, as well as decisions that were taken during implementation. Do not explain the implementation that can be viewed in the code.

## Architecture

- `packages/types/` is **deprecated — never modify it**. Types live in
  `packages/core/`.
- An AI provider integration spans three places: core instrumentation in
  `packages/core/src/tracing/{provider}/`, the Node integration in
  `packages/node/src/integrations/tracing/{provider}/`, and the edge
  runtime in `packages/cloudflare/src/integrations/tracing/{provider}.ts`.

## Linting & Formatting

- This project uses **Oxlint** and **Oxfmt** — NOT ESLint or Prettier
- Never run `eslint`, `npx eslint`, or any ESLint CLI — use `yarn lint` (Oxlint) instead
- Never run `prettier` — use `yarn format` (Oxfmt) instead
- ESLint packages in the repo are legacy/e2e test app dependencies — ignore them
- Do not create, modify, or suggest `.eslintrc`, `eslint.config.*`, or `.prettierrc` files

## Coding Standards

- Follow existing conventions — check neighboring files
- Reach for existing utils before writing a new one. Most shared helpers live in `@sentry/core` (`packages/core/src/utils/`), with browser helpers in `packages/browser-utils/`. Search first (LSP `workspaceSymbol` or grep) for common needs (type guards in `is.ts`, object/array helpers, `normalize`, `dsn`, `merge`, string/url helpers). Reuse or extend the existing util rather than adding a near-duplicate; only introduce a new util when nothing fits.
- Only use libraries already in the codebase
- Never expose secrets or keys
- When modifying files, cover all occurrences (including `src/` and `test/`)
- Comments explain **why**, never **what** — never add a comment that restates what the code does or describes the change being made; only comment when the reasoning isn't obvious from the code itself
- Do not use `expect(someSpy.mock.calls[0]?.[0])` or similar constructs to check what a spy was called with.
  Instead use `expect(someSpy).toHaveBeenCalledWith(...)` or derivatives for a more readable and less brittle test assertion.

## Lazy Loading Is a Last Resort

Do NOT "fix" a bundler, runtime, or platform incompatibility by making an import lazy or opaque — `createRequire`, require-inside-a-function, dynamic `import()`, computed specifiers. Not all bundlers understand `createRequire`, and anything opaque to static analysis just moves the breakage to a different consumer (pnpm isolation, workerd, Turbopack, nft tracing) while masking the real defect. SDK code must stay statically analyzable.

Before even proposing lazy loading:

1. Reproduce the failure and read the **actual** error — not a plausible theory about it. If the error is swallowed, extract it (debug logging, running the server/bundle directly) before choosing a fix.
2. Fix the root cause at the layer it lives in, in roughly this order: build output shape (rollup/commonjs options like `interop`, `strictRequires`, `requireReturnsDefault`, `output.paths`), module resolution (`exports` maps, self-references, absolute-path externals), packaging (what ships in the tarball, bundled vs external deps), and only then consumer-side configuration.
3. If, after exhausting these, lazy loading still seems necessary, stop and ask — explain what was tried and why nothing else works. Do not implement it first.

## Reference Documentation

- [Span Attributes](https://develop.sentry.dev/sdk/telemetry/attributes.md)
- [Scopes (global, isolation, current)](https://develop.sentry.dev/sdk/telemetry/scopes.md)

## Skills

Task-specific instructions live in `.claude/skills/`. Each skill lists its
own trigger, so consult that directory rather than this file.
