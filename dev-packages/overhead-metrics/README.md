# Overhead performance metrics

Evaluates Sentry & Replay impact on website performance by running a web app in Chromium via Playwright and collecting
various metrics.

The general idea is to run a web app without Sentry, and then run the same app again with Sentry and another one with
Sentry+Replay included. For the three scenarios, we collect some metrics (CPU, memory, vitals) and later compare them
and post as a comment in a PR. Changes in the metrics, compared to previous runs from the main branch, should be
evaluated on case-by-case basis when preparing and reviewing the PR.

## Resources

- https://github.com/addyosmani/puppeteer-webperf
