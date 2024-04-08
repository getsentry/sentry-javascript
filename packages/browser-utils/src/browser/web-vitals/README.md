# web-vitals

> A modular library for measuring the [Web Vitals](https://web.dev/vitals/) metrics on real users.

This was vendored from: https://github.com/GoogleChrome/web-vitals: v3.5.2

The commit SHA used is:
[7b44bea0d5ba6629c5fd34c3a09cc683077871d0](https://github.com/GoogleChrome/web-vitals/tree/7b44bea0d5ba6629c5fd34c3a09cc683077871d0)

Current vendored web vitals are:

- LCP (Largest Contentful Paint)
- FID (First Input Delay)
- CLS (Cumulative Layout Shift)
- INP (Interaction to Next Paint)
- TTFB (Time to First Byte)

## Notable Changes from web-vitals library

This vendored web-vitals library is meant to be used in conjunction with the `@sentry/tracing` `BrowserTracing`
integration. As such, logic around `BFCache` and multiple reports were removed from the library as our web-vitals only
report once per pageload.

## License

[Apache 2.0](https://github.com/GoogleChrome/web-vitals/blob/master/LICENSE)

## CHANGELOG

https://github.com/getsentry/sentry-javascript/pull/5987

- Bumped from Web Vitals v2.1.0 to v3.0.4

https://github.com/getsentry/sentry-javascript/pull/3781

- Bumped from Web Vitals v0.2.4 to v2.1.0

https://github.com/getsentry/sentry-javascript/pull/3515

- Remove support for Time to First Byte (TTFB)

https://github.com/getsentry/sentry-javascript/pull/2964

- Added support for Cumulative Layout Shift (CLS) and Time to First Byte (TTFB)

https://github.com/getsentry/sentry-javascript/pull/2909

- Added support for FID (First Input Delay) and LCP (Largest Contentful Paint)

https://github.com/getsentry/sentry-javascript/pull/9690

- Added support for INP (Interaction to Next Paint)

TODO

- Add support for TTFB (Time to First Byte)
