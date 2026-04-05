---
name: release
description: Publish a new Sentry JavaScript SDK release. Use when preparing a release, updating the changelog, or creating a release branch.
argument-hint: [VERSION]
---

# Release Process

See `docs/publishing-a-release.md` for full details.

## Steps

1. Ensure you're on `develop` with latest changes. Stash any unsaved work with `git stash -u` if needed.
2. Run `yarn changelog` (use `yarn changelog | pbcopy` to copy output).
3. Decide on a version per [semver](https://semver.org). Check the top of `CHANGELOG.md` for the current version.
4. Create branch `prepare-release/VERSION` off `develop`.
5. Update `CHANGELOG.md` — add the new version entry with the changelog output. See the "Updating the Changelog" section in `docs/publishing-a-release.md` for formatting details. Do not remove existing entries.
6. Commit: `meta(changelog): Update changelog for VERSION`
7. Push the branch and remind the user to open a PR targeting `master`.
8. If you were on a different branch, checkout back and `git stash pop` if needed.

## First-time SDK releases

Follow `docs/new-sdk-release-checklist.md`. If anything doesn't match the checklist, remind the user.

## Key commands

- `yarn changelog` — generate changelog entries
- `yarn lint` — verify code quality
- `yarn test` — run test suite
- `yarn build:dev` — verify build
