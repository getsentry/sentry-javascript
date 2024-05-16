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
   [Prepare Release](https://github.com/getsentry/sentry-javascript/actions/workflows/release.yml) on master.
7. A new issue should appear in https://github.com/getsentry/publish/issues.
8. Wait until the CI check runs have finished successfully (there is a link to them in the issue).
9. Once CI passes successfully, ask a member of the
   [@getsentry/releases-approvers](https://github.com/orgs/getsentry/teams/release-approvers) to approve the release. a.
   Once the release is completed, a sync from `master` ->` develop` will be automatically triggered

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
7. Commit, push, and continue with step 4 from the previous section with the general instructions (above).
