### To prepare branch for deploying on Vercel:

From `packages/nextjs`, run

  `yarn vercel:branch`.

This will delete unneeded packages (angular, vue, etc) in order to speed up deployment. It will then commit that change.
When your branch is ready to PR, just rebase and drop that commit.

### To prepare test app for using current branch:

First, make sure the branch you want to test is checked out in your `sentry-javascript` repo, and that all changes you
want to test are pushed to GitHub.

From `packages/nextjs`, run

  `yarn vercel:project <path/to/testapp>`.

This will copy a script into a `.sentry` folder at the root level of your test app,and create a second one. (The first
script is the one you'll run on Vercel. The second is a helper to the first, so that it knows which branch to use.) It
will then commit (but not push) this change.

Go into your project settings on Vercel and change the install command to

  `source .sentry/install-sentry-from-branch.sh`.

If you're using bundle analyzer, change the build command to

  `yarn build && mv .next/analyze/* public`.

The bundle visualizations will be available on your deployed site at `/client.html` and `/server.html`.

### To test the SDK:

Once you have pushed the changes made by `yarn vercel:project` to GitHub, just make changes and push, and Vercel will
always use the latest version of both the SDK and your test app. Pushing changes to your test app will trigger a new
build in Vercel; for changes to the SDK, you'll need to manually redeploy, either by kicking off a new build or simply
choosing 'Redeploy' on your most recent existing build.
