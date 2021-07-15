# web-vitals

> A modular library for measuring the [Web Vitals](https://web.dev/vitals/) metrics on real users.

This was vendored from: https://github.com/GoogleChrome/web-vitals: v2.1.0

The commit SHA used is: [3f3338d994f182172d5b97b22a0fcce0c2846908](https://github.com/GoogleChrome/web-vitals/tree/3f3338d994f182172d5b97b22a0fcce0c2846908)

Current vendored web vitals are:

- LCP (Largest Contentful Paint)
- FID (First Input Delay)
- CLS (Cumulative Layout Shift)

## Notable Changes from web-vitals library

This vendored web-vitals library is meant to be used in conjunction with the `@sentry/tracing` `BrowserTracing` integration.
As such, logic around `BFCache` and multiple reports were removed from the library as our web-vitals only report once per pageload.

## License

[Apache 2.0](https://github.com/GoogleChrome/web-vitals/blob/master/LICENSE)

## CHANGELOG

https://github.com/getsentry/sentry-javascript/pull/3781
- Bumped from Web Vitals v0.2.4 to v2.1.0

https://github.com/getsentry/sentry-javascript/pull/3515
- Remove support for Time to First Byte (TTFB)

https://github.com/getsentry/sentry-javascript/pull/2964
- Added support for Cumulative Layout Shift (CLS) and Time to First Byte (TTFB)

https://github.com/getsentry/sentry-javascript/pull/2909
- Added support for FID (First Input Delay) and LCP (Largest Contentful Paint)
