# Rerun Size Check

Reruns the current PR's Size Check job after the bundle size approval label changes. The existing rerun logic waits for CI to finish and skips closed PRs or PRs whose head changed while waiting.

The workflow checks out `github.workflow_sha` so the action and workflow come from the same trusted commit. This also makes the action available when labeling a PR whose base SHA predates its introduction.

The checked-in `dist/index.cjs` includes the Actions toolkit dependencies, so the workflow needs no dependency installation. Rebuild it from the repository root after changing the action or updating its dependencies:

```sh
pnpm install --frozen-lockfile
pnpm exec node .github/actions/rerun-size-check/build.mjs
```

Commit the regenerated `dist/` files alongside the source changes. The build uses the repository's existing esbuild and Actions toolkit dependencies.
