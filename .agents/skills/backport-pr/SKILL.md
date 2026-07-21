---
name: backport-pr
description: Backport a merged PR to a maintenance major branch (v10 by default) in getsentry/sentry-javascript. Cherry-picks the PR's squash-merge commit onto the target branch, namespaces the commit/PR title scope (e.g. fix(core) -> fix(v10/core)), and opens a draft backport PR. Use when asked to backport a PR, port a fix to v10 (or an older major like v9), or cut a maintenance release change. Trigger phrases include "backport", "port to v10", "cherry-pick to the maintenance branch", "release this on v10".
argument-hint: '<pr-number> [target-major]  # e.g. 18211 v10; target defaults to v10'
---

# Backport a PR to a maintenance major branch

`develop` is the current major (v11). Released changes now go onto the previous major's
maintenance branch (`v10` by default). This skill cherry-picks a merged PR's changes onto
that branch and opens a draft backport PR, following the same convention used for the v9
backports.

## Inputs

- **PR number** (required): the already-merged PR on `develop` to backport.
- **Target major** (optional, default `v10`): the maintenance branch to backport onto.
  Accept `v10`, `10`, `v9`, etc. Normalize to a branch name like `v10`.

If the PR number is missing, ask for it. Do not guess.

## Convention (learned from the v9 backports)

- **Base branch** = the target major branch (`v10`), which must already exist on `origin`.
- **Commit + PR title**: keep the original conventional-commit prefix but namespace the
  scope with the major, e.g.
  - `fix(core): Fix logs flush starvation` -> `fix(v10/core): Fix logs flush starvation`
  - `feat(node): Add X` -> `feat(v10/node): Add X`
  - If the original has no scope (e.g. `fix: ...`), use `fix(v10): ...`.
  - For a multi-scope title, prefix the whole group once, not each scope:
    `fix(cloudflare,deno,node): ...` -> `fix(v10/cloudflare,deno,node): ...`.
- **PR body** is a single line: `Backport of: #<original-pr-number>`.
- **PR is opened as a draft.**
- **Branch name**: `ab/<major>-<short-slug>` (personal rule is the `ab/` prefix). Derive
  `<short-slug>` from the original PR title, e.g. `ab/v10-fix-log-flush-starvation`.
- The changes come from the PR's **squash-merge commit** on `develop` (one commit per PR),
  so a single `git cherry-pick` normally covers the whole PR.

## Steps

### 1. Resolve the PR and target branch

```bash
# Fetch PR metadata (title, merge commit, base branch)
gh pr view <PR> --json number,title,baseRefName,mergeCommit,state,url
```

Verify:
- The PR is **merged** (`state == "MERGED"`). If not, stop and tell the user.
- Its `baseRefName` is `develop` (or the expected parent major). If it targeted something
  else, confirm with the user before continuing.

Grab `mergeCommit.oid` — this is the squash commit to cherry-pick.

Make sure the target branch exists and is up to date:

```bash
git fetch origin <major> develop
git rev-parse --verify origin/<major>   # errors if the branch doesn't exist
```

If `origin/<major>` doesn't exist, stop: the maintenance branch hasn't been created yet.

Then check the change isn't already on the target. A freshly cut major often still shares
history with `develop`, so a recent PR may already be present:

```bash
git merge-base --is-ancestor <mergeCommit-oid> origin/<major> && echo "ALREADY ON <major>"
```

If it prints `ALREADY ON`, there's nothing to backport — stop and tell the user rather than
producing an empty commit.

### 2. Create the backport branch off the target major

```bash
git checkout -b ab/<major>-<slug> origin/<major>
```

### 3. Cherry-pick the merge commit

```bash
git cherry-pick <mergeCommit-oid>
```

- If git reports the pick is **empty** ("nothing to commit" / "the previous cherry-pick is
  now empty"), the change is already on the target. Run `git cherry-pick --abort` and stop —
  do not force it through with `--allow-empty`. This is the same situation the ancestor check
  in step 1 guards against, caught here for changes that landed via a different commit.
- On **conflicts**: resolve them by consulting the original diff (`git show <oid>`).
  The target major may lack refactors that landed on `develop`, so adapt the change to the
  older code rather than force-porting it. After resolving: `git add -A && git cherry-pick --continue`.
  If the change can't be cleanly adapted, stop and surface the conflict to the user instead
  of guessing.
- If the PR was **not** squash-merged (multiple commits, e.g. a merge commit), cherry-pick
  each relevant commit in order, or use `git cherry-pick -m 1 <merge-oid>` for a merge commit.

### 4. Reword the commit to namespace the scope

Rewrite only the subject line's scope to include the major; keep the body. Do **not** add a
`Co-Authored-By` line or conventional prefix beyond what's described here — the backport
branch's first commit mirrors an existing commit rather than being new authored work.

```bash
git commit --amend -m "<prefix>(<major>/<scope>): <original subject>" -m "Backport of: #<PR>"
```

Example: `fix(v10/core): Fix logs flush timeout starvation with continuous logging`

### 5. Build and verify before pushing

Run the repo's pre-commit checks so the backport branch is green:

```bash
yarn format
yarn lint
yarn build:dev
```

Run tests scoped to the touched packages when possible (full `yarn test` if unsure). If the
target major's toolchain differs and a check fails for reasons unrelated to the change, note
it for the user rather than silently skipping.

### 6. Push and open the draft PR

```bash
git push -u origin ab/<major>-<slug>

gh pr create \
  --draft \
  --base <major> \
  --title "<prefix>(<major>/<scope>): <original subject>" \
  --body "Backport of: #<PR>"
```

### 7. Cross-link on the original PR

Add a note to the original PR pointing at the backport (mirrors `v9 backport: #NNNN`):

```bash
gh pr comment <PR> --body "<major> backport: #<new-backport-pr>"
```

## Notes

- Never push directly to `develop`, `master`, or the major branch. Work only on the
  `ab/<major>-...` branch and open a PR.
- One PR per backport. If asked to backport several PRs, repeat the whole flow per PR (each
  gets its own branch and draft PR).
- If asked to backport to multiple majors at once (e.g. v10 and v9), do them as separate
  branches/PRs, each based off its own `origin/<major>`.
