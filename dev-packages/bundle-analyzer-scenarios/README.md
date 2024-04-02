# Bundle Analyzer Scenarios

This repository contains a set of scenarios to check the SDK against webpack bundle analyzer.

You can run the scenarios by running `yarn analyze` and selecting the scenario you want to run.

To get the best results, you should build the SDK packages with with `preserveModules` set to `true`. You can do this
via the `SENTRY_BUILD_PRESERVE_MODULES`.

```bash
SENTRY_BUILD_PRESERVE_MODULES=true yarn build
```
