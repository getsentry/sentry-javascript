# Commit, Issue & PR guidelines

## Commits

For commit messages, we use the format:

```
<type>(<scope>): <subject> (<github-id>)
```

For example: `feat(core): Set custom transaction source for event processors (#5722)`.

See [commit message format](https://develop.sentry.dev/commit-messages/#commit-message-format) for details.

The Github-ID can be left out until the PR is merged.

## Issues

Issues should at least be categorized by package, for example `package: Node`. Additional labels for categorization can
be added, and the Sentry SDK team may also add further labels as needed.

## Pull Requests (PRs)

PRs are merged via `Squash and merge`. This means that all commits on the branch will be squashed into a single commit,
and committed as such onto `develop`.

- The PR name can generally follow the commit name (e.g.
  `feat(core): Set custom transaction source for event processors`)
- Make sure to rebase the branch on `develop` before squashing it
- Make sure to update the commit message of the squashed branch to follow the commit guidelines - including the PR
  number
- If you are a Sentry employee, assign yourself to the PR

Please note that we cannot _enforce_ Squash Merge due to the usage of Gitflow (see below). Github remembers the last
used merge method, so you'll need to make sure to double check that you are using "Squash and Merge" correctly.

## Backporting PRs/Commits

If you want to backport a commit to a previous major version, make sure to reflect this in the PR/commit title.
The name should have the backported major as a scope prefix. For example:

```
feat(v8/core): Set custom transaction source for event processors (#5722)
```

## Gitflow

We use [Gitflow](https://docs.github.com/en/get-started/quickstart/github-flow) as a branching model.

For more details, [see our Gitflow docs](./gitflow.md).
