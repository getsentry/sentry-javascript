# Cutting a Maintenance Branch for a New Major

When we start work on a new major on `develop`, we cut a maintenance branch for the
**previous** major so it can still receive fixes. The branch is named after the previous
major, e.g. when we started v10 on `develop`, we created the `v9` branch.

## 1. Create and push the branch

Create a `vX` branch off the last released state (`master`) and push it, where `vX` is
the previous major entering maintenance.

## 2. Add branch protection

In GitHub → Settings → Branches, add a protection rule for `vX` matching the existing
`master`/`develop` rules. This requires elevated repo permissions, so a manager likely
needs to do it.

## 3. Add the branch to CI

Add `vX` to the `branches` filters of the workflows that gate on maintained majors
(they already list the older majors):

- `.github/workflows/build.yml` — `push.branches`
- `.github/workflows/enforce-license-compliance.yml` — `push.branches` **and** `pull_request.branches`
