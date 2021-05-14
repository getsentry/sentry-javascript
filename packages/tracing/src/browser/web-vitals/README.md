# web-vitals

> A modular library for measuring the [Web Vitals](https://web.dev/vitals/) metrics on real users.

This was vendored from: https://github.com/GoogleChrome/web-vitals

Current vendored version: 1.2.2

The commit SHA used is: [d51aa10f68eda421ed90f2a966c3e9e2611d6d57](https://github.com/GoogleChrome/web-vitals/tree/d51aa10f68eda421ed90f2a966c3e9e2611d6d57)

Current vendored web vitals are:

- LCP (Largest Contentful Paint)
- FID (First Input Delay)
- CLS (Cumulative Layout Shift)

## License

[Apache 2.0](https://github.com/GoogleChrome/web-vitals/blob/master/LICENSE)

## Notable differences from `web-vitals` library

<!---
TODO(abhi): Uhh I gotta figure this out lol, it's def something with polyfilled func
-->
## CHANGELOG

https://github.com/getsentry/sentry-javascript/pull/3515
- Remove support for Time to First Byte (TTFB)

https://github.com/getsentry/sentry-javascript/pull/2964
- Added support for Cumulative Layout Shift (CLS) and Time to First Byte (TTFB)

https://github.com/getsentry/sentry-javascript/pull/2909
- Added support for FID (First Input Delay) and LCP (Largest Contentful Paint)
