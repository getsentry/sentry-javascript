When I ask you to create a release, do the following:

- Follow the `../docs/publishing-a-release.md` markdown file to the letter!
- DO NOT finish early or deviate from the steps. Keep the branch name in mind.
- Make sure to publish a new minor version if the release includes any user-facing features. Dependency bumps are usually not a semver-feature but make sure to read the commit message of the respective commit to ensure this is not a user-facing feature.
- Read commit messages of the respective commits for any important changes
- Feel free to call out important changes right away.
- Use the `gh` CLI to then create a PR against `master`. Leave the PR description empty.
