---
name: dogfood-release
description: Bump a just-published Sentry JS SDK version across the internal consumer repos (sentry, gib-potato, sentry-changelog, sentry-docs, chartcuterie), verify each one builds, and open a draft PR per repo. Use after publishing an SDK release, especially a prerelease, to catch breaking changes early. Trigger phrases include "dogfood this release", "dogfood the SDK", "bump the SDK in our repos", "roll out <version> to the consumer repos".
argument-hint: '<version>  # e.g. 11.0.0-beta.0'
---

# Dogfood an SDK release in the consumer repos

Sentry runs the freshly published SDK in its own products before it goes stable.
This skill bumps one version across every internal consumer repo, proves each still
builds, and opens one draft PR per repo.

## Requirements

Local checkouts under `~/projects/`. Skip any repo that is missing and say so.
Do not clone: a missing checkout is the user's call.

## The repos

| Repo | Path | PM | Base | Sentry deps | Range style |
|---|---|---|---|---|---|
| `getsentry/sentry` | `~/projects/sentry` | pnpm | `master` | `@sentry/{browser,core,node,react}` | exact |
| `getsentry/gib-potato` | `~/projects/gib-potato` | `vp` (vite-plus) | `main` | `@sentry/{vue,bundler-plugins}` | caret |
| `getsentry/sentry-changelog` | `~/projects/sentry-changelog` | pnpm | `main` | `@sentry/nextjs` | caret |
| `getsentry/sentry-docs` | `~/projects/sentry-docs` | pnpm | `master` | `@sentry/{browser,nextjs}` | exact |
| `getsentry/chartcuterie` | `~/projects/chartcuterie` | yarn | `master` | `@sentry/{node,profiling-node}` | exact |

Re-derive these each run rather than trusting the table. Deps and base branches drift.

```bash
for d in sentry gib-potato sentry-changelog sentry-docs chartcuterie; do
  cd ~/projects/$d || continue
  echo "## $d  base=$(gh repo view --json defaultBranchRef --jq .defaultBranchRef.name)"
  node -p "require('./package.json').packageManager || 'none'"
  grep -E '"@sentry/[a-z-]+":' package.json
done
```

## Step 0: check the version is actually installable

Two separate gates. Check both before touching any repo, because both have burned us.

**1. Published to npm.** Craft publishes packages one at a time, so a green release
branch does not mean every package is up.

```bash
npm view @sentry/core@<version> version --registry https://registry.npmjs.org
```

**2. Cleared Sentry's registry firewall.** Internal repos install through
`sfw.security.sentry.io`, which quarantines packages it has not scanned. A **brand new
package** in the release (one whose first-ever version is this release) will 403 there
even though it is fine on public npm.

```bash
# every package the release added, plus one known-good control
curl -s -o /dev/null -w "%{http_code}  <pkg>\n" \
  https://sfw.security.sentry.io/npm/<pkg>/-/<basename>-<version>.tgz
curl -s -o /dev/null -w "%{http_code}  control @sentry/core\n" \
  https://sfw.security.sentry.io/npm/@sentry/core/-/core-<version>.tgz
```

To find new packages, diff the dependency sets of the previous and new release:

```bash
diff <(npm view @sentry/nextjs@<prev> dependencies --registry https://registry.npmjs.org) \
     <(npm view @sentry/nextjs@<version> dependencies --registry https://registry.npmjs.org)
```

If a package 403s, **stop before installing**. Report which repos are blocked (any repo
whose dep tree reaches that package) and ask for it to be allowlisted. Carry on with the
repos that do not reach it. Do not work around the firewall.

## Step 1: branch and bump

One branch name across all repos, `ab/bump-sentry-<version-slug>`
(e.g. `ab/bump-sentry-11-beta-0`). Always branch off a **freshly fetched** base, never off
whatever the checkout was left on last time.

Anchor the version replacement on the **old version string**, not the package name. Repos
carry unrelated `@sentry/*` packages (`@sentry/conventions`, `@sentry/toolbar`,
`@sentry/webpack-plugin`, `@sentry/jest-environment`) that must not move. Preserve the
existing range prefix:

```bash
cd ~/projects/$d
git fetch origin $BASE --quiet
git checkout -B ab/bump-sentry-<slug> origin/$BASE
sed -i '' 's/<old-version>"/<version>"/g' package.json
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"   # still valid JSON
git diff package.json
```

## Step 2: install with the repo's own package manager

**Use the package manager the repo declares.** Reaching for a different one (or a
different major of the same one) rewrites unrelated parts of the lockfile: a stray npm
once re-expanded the bundled deps of `@tailwindcss/oxide-wasm32-wasi` in gib-potato and
buried the real change.

- `packageManager` field in `package.json` is the source of truth.
- gib-potato is the exception worth remembering: it declares npm but is driven by
  **vite-plus**, so use `node_modules/.bin/vp install`.
- Do a full install, not lockfile-only. The build in step 3 needs real `node_modules`.

Then check the lockfile diff is Sentry-only. It should contain version moves and nothing
else:

```bash
# npm
git diff package-lock.json | grep -o '^[-+]        "node_modules/[^"]*"' | sort -u
# pnpm / yarn
git diff <lockfile> | grep -E '^[+-] ' | grep -viE 'sentry|opentelemetry' | head -40
```

Anything unrelated in there means the wrong package manager ran. Reset the lockfile and
redo the install rather than committing the churn.

## Step 3: build and adapt

Build every repo. A prerelease exists precisely to break things, so expect fallout and
fix it in the consumer, following `MIGRATION.md` in `sentry-javascript`.

| Repo | Verify with |
|---|---|
| sentry | `pnpm run typecheck`, `pnpm run build-production`, then `pnpm test-ci <affected specs>` and `pnpm run lint:js <changed files>` |
| gib-potato | `node_modules/.bin/vp build` |
| sentry-changelog | `pnpm build` |
| sentry-docs | `pnpm build` |
| chartcuterie | `yarn build` |

The `sentry` frontend is where migration work usually lands. Files that have needed edits
before: `static/app/bootstrap/initializeSdk.tsx`,
`static/app/serviceWorker/worker/initializeSentry.ts`,
`static/app/utils/performanceForSentry/index.tsx`, `static/app/views/issueList/overview.tsx`.
Run `pnpm exec oxfmt <files>` on anything you touch.

Two things worth an explicit look on a v11 bump, both of which have bitten us:

- **Moved entry points.** `withSentryConfig` moved to `@sentry/nextjs/config`, so
  `next.config.mjs` in sentry-changelog and sentry-docs needs its import updated.
- **Span name changes.** Low-cardinality span names change what `beforeSendSpan` and any
  dashboard or alert keyed on span names actually see. Flag this rather than silently
  bumping.

Also sanity-check what the lockfile *dropped*. A v11 bump should remove the OpenTelemetry
packages from repos that only use the browser SDK; if they are still there, something
resolved to the old major.

## Step 4: commit, push, PR

One commit per repo. Match each repo's own commit convention, which you can read off its
log (`git log origin/$BASE --oneline -20`); they differ (`chore(deps):`, `build(deps):`,
`build(js):`, plain `chore:`). Say what moved, and note any adaptation separately:

```
build(deps): Update @sentry/nextjs to <version>

withSentryConfig moved to the @sentry/nextjs/config entry point in <version>.
Update the import in next.config.mjs.
```

Open every PR as a **draft**, `## What` / `## Why` only:

```bash
gh pr create --draft --base $BASE \
  --title "<commit subject>" \
  --body "## What

Update \`@sentry/x\` to <version>.

## Why

Keep <repo> on the latest v11 prerelease so we catch breaking changes early."
```

## Report back

A short table: repo, PR link, and what needed adapting. Call out explicitly:

- repos skipped for a missing checkout,
- repos blocked by the registry firewall, and which package blocked them,
- any breaking change that needed a code fix, since that is the dogfooding signal and
  usually belongs in `MIGRATION.md` if it is not there yet.
