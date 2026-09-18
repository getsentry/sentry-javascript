# Running this repo in Claude Code cloud (remote sessions)

Most of the setup is committed to the repo and works automatically:

- **`scripts/claude-cloud-setup.sh`** — bootstrap: `yarn install --frozen-lockfile` + `yarn build:dev`. Runs **every** session so the checkout is always built against the current branch. Repeated runs are cheap (frozen install is a no-op when warm; Nx only rebuilds changed packages).
- **`.claude/settings.json`** — a `SessionStart` hook runs that script, but only in cloud sessions (`CLAUDE_CODE_REMOTE=true`). Local sessions are unaffected.

## One-time environment setup (done in the `claude.ai/code` UI)

These cannot live in the repo and must be set once per environment:

1. **Setup script** — install the language runtime the sandbox lacks, e.g.:

   ```bash
   bash scripts/claude-cloud-setup.sh
   ```

   Do not rely on the cached result for freshness: install + build re-run on every session via the SessionStart hook, because the working branch changes constantly. This runs the same script mostly to warm the caches (node_modules, Nx) so the first real session is fast.

2. **Network access:** `Trusted` (default) is sufficient — it already allows the npm registry and GitHub, which is all the install needs.

3. **Environment variables:** none required for build/test. Add any Sentry DSNs or tokens here only if you intend to run E2E/integration suites that need them (visible to anyone who can edit the environment — do not put long-lived secrets here).

## Notes

- Node/Yarn versions come from `package.json` (Volta locally). In the cloud we use the sandbox runtime and pass `--ignore-engines`, matching CI.
- The full production `yarn build` is not run at startup; `build:dev` (transpile + types) is enough for editing and running unit tests. Run `yarn build` manually if you need bundles.
