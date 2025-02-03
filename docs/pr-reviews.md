# PR reviews

Make sure to open PRs against `develop` branch.

For feedback in PRs, we use the [LOGAF scale](https://develop.sentry.dev/engineering-practices/code-review/#logaf-scale) to specify how
important a comment is.

You only need one approval from a maintainer to be able to merge. For some PRs, asking specific or multiple people for
review might be adequate. You can either assign SDK team members directly (e.g. if you have some people in mind who are
well suited to review a PR), or you can assign `getsentry/team-web-sdk-frontend`, which will randomly pick 2 people from
the team to assign.

Our different types of reviews:

1. **LGTM without any comments.** You can merge immediately.
2. **LGTM with low and medium comments.** The reviewer trusts you to resolve these comments yourself, and you don't need
   to wait for another approval.
3. **Only comments.** You must address all the comments and need another review until you merge.
4. **Request changes.** Only use if something critical is in the PR that absolutely must be addressed. We usually use
   `h` comments for that. When someone requests changes, the same person must approve the changes to allow merging. Use
   this sparingly.

You show generally avoid to use "Auto merge". The reason is that we have some CI workflows which do not block merging
(e.g. flaky test detection, some optional E2E tests). If these fail, and you enabled Auto Merge, the PR will be merged
if though some workflow(s) failed. To avoid this, wait for CI to pass to merge the PR manually, or only enable "Auto
Merge" if you know that no optional workflow may fail. Another reason is that, as stated above in 2., reviewers may
leave comments and directly approve the PR. In this case, as PR author you should review the comments and choose which
to implement and which may be ignored for now. "Auto Merge" leads to the PR feedback not being taken into account.

## Reviewing a PR from an external contributor

1. Make sure to review PRs from external contributors in a timely fashion. These users spent their valuable time to
   improve our SDK, so we should not leave them hanging with a review!
2. Make sure to click "Approve and Run" on the CI for the PR, if it does not seem malicious.
3. Provide feedback and guidance if the PR is not ready to be merged.
4. Assign the PR to yourself if you start reviewing it. You are then responsible for guiding the PR either to
   completion, or to close it if it does not align with the goals of the SDK team.
5. Make sure to update the PR name to align with our commit name structure (see above)
