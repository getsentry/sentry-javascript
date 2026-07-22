---
name: backport-pr
description: Backport a merged PR to a maintenance major branch (v10 by default) in getsentry/sentry-javascript. Cherry-picks the PR's squash-merge commit onto the target branch, namespaces the commit/PR title scope (e.g. fix(core) -> fix(v10/core)), and opens a draft backport PR. Use when asked to backport a PR, or port a fix to v10 (or an older major like v9). Trigger phrases include "backport", "port to v10", "release this on v10".
argument-hint: '<pr-number-or-url> [target-major]  # e.g. 18211 v10; target defaults to v10'
---

# Backport a PR to a maintenance major branch

`develop` is the current major (v11). A change that also needs to ship on a still-maintained
older major has to land on that major's branch too (`v10` by default). This skill cherry-picks
a merged `develop` PR onto that branch and opens a draft backport PR.

## Inputs

- **PR** (required): the already-merged PR on `develop` to backport, given as either a full
  GitHub URL or a bare number. `gh pr view` accepts both, so pass whichever the user gave
  through unchanged; `<PR>` in the commands below is that value.
- **Target major** (optional, default `v10`): the maintenance branch to backport onto.
  Accept `v10`, `10`, `v9`, etc. Normalize to a branch name like `v10`.

If no PR is given, ask for it. Do not guess.

## Convention

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
- **Working branch**: branch off the target major and give it a descriptive name.
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

Grab `mergeCommit.oid` — this is the squash commit to cherry-pick. Also grab `number`: use
that bare number (not the raw input) wherever `#<PR>` appears below, so `Backport of:` reads
`Backport of: #18211` even when the user passed a URL.

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
git checkout -b <branch> origin/<major>
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

### 4. Build and verify

Run the repo's pre-commit checks. Do this **before** finalizing the commit in step 5, because
`yarn format` writes changes to the working tree — those fixes must end up inside the backport
commit, not left dangling after it (otherwise you'd push an unformatted tree and CI would fail
on a commit that doesn't match your local state).

```bash
yarn format
yarn lint:fix
yarn build:dev
```

Use `lint:fix`, not `lint` — plain `yarn lint` only reports, so auto-fixable issues would
otherwise survive to fail CI.

Run tests scoped to the touched packages when possible (full `yarn test` if unsure). If the
target major's toolchain differs and a check fails for reasons unrelated to the change, note
it for the user rather than silently skipping.

### 5. Finalize the commit (reword scope + fold in verification changes)

Stage the format/lint fixes, then amend in one step: this both namespaces the subject scope
with the major and captures those fixes. The final message is the namespaced subject plus the
one-line `Backport of:` body (this replaces the squash-merge body, matching the convention
above). Do **not** add a `Co-Authored-By` line — the backport commit mirrors an existing commit
rather than being new authored work.

Build the namespaced title as in the convention above: `<prefix>(<major>/<scope>):` when the
original had a scope, or `<prefix>(<major>):` when it didn't (never emit an empty `<major>/`).

`--amend` only rewrites HEAD, which is exactly right for the usual single squash commit. If
step 3 cherry-picked multiple commits, leave their individual messages as-is — the namespaced
title lives on the PR (step 6), not on each commit.

Stage only the files the cherry-pick and verification touched — `git add -u` restages tracked
files without sweeping in unrelated local edits. Sanity-check the staged set with
`git status` first if `yarn format` may have reformatted files outside the backport.

```bash
git add -u
git commit --amend -m "<namespaced-title>" -m "Backport of: #<PR>"
```

Example subject: `fix(v10/core): Fix logs flush timeout starvation with continuous logging`

Confirm the tree is clean so nothing is left uncommitted before you push:

```bash
git status --porcelain   # expect no output
```

### 6. Push and open the draft PR

The `Backport of: #<PR>` body references the original PR, so GitHub cross-links the two
automatically — no separate comment needed.

```bash
git push -u origin <branch>

gh pr create \
  --draft \
  --base <major> \
  --title "<namespaced-title>" \
  --body "Backport of: #<PR>"
```

## Notes

- Never push directly to `develop`, `master`, or the major branch. Work only on your
  backport branch and open a PR.
- One PR per backport. If asked to backport several PRs, repeat the whole flow per PR (each
  gets its own branch and draft PR).
- If asked to backport to multiple majors at once (e.g. v10 and v9), do them as separate
  branches/PRs, each based off its own `origin/<major>`.
