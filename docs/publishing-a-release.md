
# Publishing a Release

_These steps are only relevant to Sentry employees when preparing and publishing a new SDK release._

**If you want to release a new SDK for the first time, be sure to follow the [New SDK Release Checklist](./new-sdk-release-checklist.md)**

1. Determine what version will be released (we use [semver](https://semver.org)).
2. Update [`CHANGELOG.md`](https://github.com/getsentry/sentry-javascript/edit/master/CHANGELOG.md) to add an entry for the next release number and a list of changes since the last release. (See details below.)
  a. Merging the Changelog PR will automatically trigger a sync from `develop` -> `master`
3. Run the [Prepare Release](https://github.com/getsentry/sentry-javascript/actions/workflows/release.yml) workflow.
  a. Wait for this until the sync to `master` is completed.
4. A new issue should appear in https://github.com/getsentry/publish/issues.
5. Ask a member of the [@getsentry/releases team](https://github.com/orgs/getsentry/teams/releases/members) to approve the release.
  a. Once the release is completed, a sync from `master` ->` develop` will be automatically triggered

## Updating the Changelog

1. Create a new branch.
2. Run `git log --format="- %s"` and copy everything since the last release.
3. Create a new section in the changelog, deciding based on the changes whether it should be a minor bump or a patch release.
4. Paste in the logs you copied earlier.
5. Delete any which aren't user-facing changes.
6. Alphabetize the rest.
7. If any of the PRs are from external contributors, include underneath the commits `Work in this release contributed by <list of external contributors' GitHub usernames>. Thank you for your contributions!`. If there's only one external PR, don't forget to remove the final `s`. If there are three or more, use an Oxford comma. (It's in the Sentry styleguide!)
8. Commit, push, and open a PR with the title `meta: Update changelog for <fill in relevant version here>` against `develop` branch.
