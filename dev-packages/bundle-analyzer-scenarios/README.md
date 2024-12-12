# Bundle Analyzer Scenarios

This repository contains a set of scenarios to check the SDK against webpack bundle analyzer.

You can run the scenarios by running `yarn analyze` and selecting the scenario you want to run.

If you want to have more granular analysis of modules, you can build the SDK packages with with `preserveModules` set to
`true`. You can do this via the `SENTRY_BUILD_PRESERVE_MODULES`.

```bash
SENTRY_BUILD_PRESERVE_MODULES=true yarn build
```

Please note that `preserveModules` has different behaviour with regards to tree-shaking, so you will get different total
bundle size results.
