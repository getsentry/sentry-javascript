# Testing an SDK Branch on Vercel

Follow the instructions below to test a branch of the SDK against a test app deployed to Vercel. This assumes you
already have such an app set up, and modifies both it and the SDK branch such that the dependency installation process
run on Vercel includes cloning the repo, building the current branch of the SDK, and setting the test app's
`@sentry/next` dependency to point to the newly-built local version.

(The clone-build-link step is necessary because you can't point a `package.json` dependency to a sub-folder of a git
repo, only a full repo itself. Since we run a monorepo, this won't work in our case.)

### To prepare your SDK branch for deploying on Vercel

From `packages/nextjs`, run

`yarn vercel:branch`.

This will delete unneeded packages (angular, vue, etc) in order to speed up deployment. It will then commit that change.
When your branch is ready to PR, just rebase and drop that commit.

### To prepare your test app for using current SDK branch

First, make sure the branch you want to test is checked out in your `sentry-javascript` repo, and that all changes you
want to test are pushed to GitHub.

From `packages/nextjs`, run

`yarn vercel:project <path/to/testapp>`.

This will copy the `install-sentry-from-branch.sh` script into a `.sentry` folder at the root level of your test app,
and create a `set-branch-name.sh` script in the same location. (The first script is the one you'll run on Vercel. The
second is called by the first, and just sets an environment variable with the current (SDK) branch name.) It will then
commit (but not push) this change.

Go into your project settings on Vercel and change the install command to

`bash .sentry/install-sentry-from-branch.sh`

and the build command to

`yarn build && bash .sentry/post-app-build.sh`.

If you're using bundle analyzer, the post-build script will move the visualizations it creates so that they're available
on your deployed site at `/client.html` and `/server.html`.

NOTE: You don't need to change the `@sentry/nextjs` dependency in your project's `package.json` file. That will happen
on the fly each time your app is deployed.

### To test the SDK

Once you have pushed the changes made by `yarn vercel:project` to GitHub, just make changes (either to the SDK or your
test app) and push them. Vercel will always use the latest version of both the SDK and your test app each time it
deploys. Pushing changes to your test app will trigger a new build in Vercel; for changes to the SDK, you'll need to
manually redeploy, either by kicking off a new build or simply choosing 'Redeploy' on your most recent existing build.
