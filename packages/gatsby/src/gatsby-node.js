exports.onCreateWebpackConfig = ({ plugins, actions }) => {
  actions.setWebpackConfig({
    plugins: [
      plugins.define({
        __SENTRY_RELEASE__: JSON.stringify(
          // GitHub Actions - https://help.github.com/en/actions/configuring-and-managing-workflows/using-environment-variables#default-environment-variables
          process.env.GITHUB_SHA ||
            // Netlify - https://docs.netlify.com/configure-builds/environment-variables/#build-metadata
            process.env.COMMIT_REF ||
            // Vercel - https://vercel.com/docs/v2/build-step#system-environment-variables
            process.env.VERCEL_GITHUB_COMMIT_SHA ||
            process.env.VERCEL_GITLAB_COMMIT_SHA ||
            process.env.VERCEL_BITBUCKET_COMMIT_SHA ||
            // Zeit (now known as Vercel)
            process.env.ZEIT_GITHUB_COMMIT_SHA ||
            process.env.ZEIT_GITLAB_COMMIT_SHA ||
            process.env.ZEIT_BITBUCKET_COMMIT_SHA ||
            '',
        ),
        __SENTRY_DSN__: JSON.stringify(process.env.SENTRY_DSN || ''),
      }),
    ],
  });
};
