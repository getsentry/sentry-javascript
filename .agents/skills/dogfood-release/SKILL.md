---
name: dogfood-release
description: Bump a just-published Sentry JS SDK version across the internal dogfooding repos (sentry, gib-potato, sentry-changelog, sentry-docs, chartcuterie) and open a draft PR per repo. Use after publishing an SDK release, especially a prerelease, to get it running in our own products early. Trigger phrases include "dogfood this release", "dogfood the SDK", "bump the SDK in our repos", "roll out <version> to the consumer repos".
argument-hint: '<version>  # e.g. 11.0.0-beta.0'
---

# Dogfood an SDK release in the consumer repos

Bump one SDK version across the internal repos that run it, and open a draft PR per repo.

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

## Step 1: ask which repos to bump

Survey first so the question shows real state, then ask with **`AskUserQuestion`,
`multiSelect: true`**, one option per repo that has a local checkout. Label each option
with the repo name and put its current SDK version in the description, so it is obvious
which ones are already up to date.

Everything is selected by default in the UI; the user unticks what they want to skip.
Only bump the repos that come back selected. Do not ask per repo, one question covers all.

Skip this question only when the user already named the repos.

## Step 2: check the version is on npm

Craft publishes packages one at a time, so a green release branch does not mean every
package is up yet.

```bash
npm view @sentry/core@<version> version --registry https://registry.npmjs.org
```

## Step 3: branch and bump

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

## Step 4: install and build

Use the package manager the repo declares. The `packageManager` field in `package.json`
is the source of truth, with one exception: gib-potato declares npm but is driven by
**vite-plus**, so use `node_modules/.bin/vp install`.

Do a full install, not lockfile-only, then build:

| Repo | Build with |
|---|---|
| sentry | `pnpm run typecheck` and `pnpm run build-production` |
| gib-potato | `node_modules/.bin/vp build` |
| sentry-changelog | `pnpm build` |
| sentry-docs | `pnpm build` |
| chartcuterie | `yarn build` |

Confirm the lockfile diff is Sentry-only, version moves and nothing else. Unrelated
entries mean the wrong package manager ran, so reset the lockfile and redo the install
rather than committing the churn.

If a build breaks on an intentional SDK change, fix it in the consumer following
`MIGRATION.md` in `sentry-javascript`, and report it.

## Step 5: commit, push, PR

One commit per repo. Match each repo's own commit convention, which you can read off its
log (`git log origin/$BASE --oneline -20`); they differ (`chore(deps):`, `build(deps):`,
`build(js):`, plain `chore:`).

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

A short table: repo, PR link, and whether anything needed adapting. Call out repos skipped
for a missing checkout, and any install or build that failed.
