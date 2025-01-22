# Publishing a Release

_These steps are only relevant to Sentry employees when preparing and publishing a new SDK release._

**If you want to release a new SDK for the first time, be sure to follow the
[New SDK Release Checklist](./new-sdk-release-checklist.md)**

1. Run `yarn changelog` on the `develop` branch and determine what version will be released (we use
   [semver](https://semver.org))
2. Create a branch `prepare-release/VERSION`, eg. `prepare-release/8.1.0`, off develop
3. Update [`CHANGELOG.md`](https://github.com/getsentry/sentry-javascript/edit/master/CHANGELOG.md) to add an entry for
   the next release number and a list of changes since the last release. (See details below.)
4. Open a PR with the title `meta(changelog): Update changelog for VERSION` against `master` branch.
5. **Be cautious!** The PR against `master` should be merged via "Merge Commit"
6. When the PR is merged, it will automatically trigger the
   [Auto Prepare Release](https://github.com/getsentry/sentry-javascript/actions/workflows/auto-release.yml) on master.
7. A new issue should appear in https://github.com/getsentry/publish/issues.
8. Wait until the CI check runs have finished successfully (there is a link to them in the issue).
9. Once CI passes successfully, ask a member of the
   [@getsentry/releases-approvers](https://github.com/orgs/getsentry/teams/release-approvers) to approve the release. a.
   Once the release is completed, a sync from `master` ->` develop` will be automatically triggered

## Publishing a release for previous majors

1. Run `yarn changelog` on a previous major branch (e.g. `v8`) and determine what version will be released (we use
   [semver](https://semver.org))
2. Create a branch, e.g. `changelog-8.45.1`, off a previous major branch (e.g. `v8`)
3. Update `CHANGELOG.md` to add an entry for the next release number and a list of changes since the
   last release. (See details below.)
4. Open a PR with the title `meta(changelog): Update changelog for VERSION` against the previous major branch (e.g. `v8`).
5. **Be cautious!** The PR against the previous major branch should be merged via "Squash and Merge"
   (as the commits already exist on this branch).
6. Once the PR is merged, open the [Prepare Release workflow](https://github.com/getsentry/sentry-javascript/actions/workflows/release.yml) and
   fill in ![run-release-workflow.png](./assets/run-release-workflow.png)
   1. The major branch you want to release for, e.g. `v8`
   2. The version you want to release, e.g. `8.45.1`
   3. The major branch to merge into, e.g. `v8`
7. Run the release workflow

## Updating the Changelog

1. Run `yarn changelog` and copy everything.
2. Create a new section in the changelog with the previously determined version number.
3. Paste in the logs you copied earlier.
4. Delete any which aren't user-facing changes (such as docs or tests).
5. Highlight any important changes with subheadings.
6. If any of the PRs are from external contributors, include underneath the commits
   `Work in this release contributed by <list of external contributors' GitHub usernames>. Thank you for your contributions!`.
   If there's only one external PR, don't forget to remove the final `s`. If there are three or more, use an Oxford
   comma. (It's in the Sentry styleguide!)
   - We have a GitHub Action "External Contributors" which collects all external contributors in the changelog section
     "Unreleased". The GitHub Action creates a PR with this change every time a PR of an external contributor is merged.
     You can safely cut and paste this line to the new release section of the changelog (but a sanity check is never
     wrong).
7. Commit, push, and continue with step 4 from the previous section with the general instructions (above).
