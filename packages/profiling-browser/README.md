<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry Profiling SDK for Browser Profiling (internal proof of concept not intended for production use)
This package is not intended for production use and should be treated as experimental/unstable.

[![npm version](https://img.shields.io/npm/v/@sentry/profiling-browser.svg)](https://www.npmjs.com/package/@sentry/profiling-browser)
[![npm dm](https://img.shields.io/npm/dm/@sentry/profiling-browser.svg)](https://www.npmjs.com/package/@sentry/profiling-browser)
[![npm dt](https://img.shields.io/npm/dt/@sentry/profiling-browser.svg)](https://www.npmjs.com/package/@sentry/profiling-browser)

## Usage 🔥
@TODO explaind the required 'Document-Policy': 'js-profiling' header

```javascript
import * as Sentry from "@sentry/browser";
import { BrowserTracing } from "@sentry/tracing";
import { ProfilingIntegration } from '@sentry/profiling-browser';

Sentry.init({
  dsn: 'https://7fa19397baaf433f919fbe02228d5470@o1137848.ingest.sentry.io/6625302',
  tracesSampleRate: 1,
  profilesSampleRate: 1, // Set profilesSampleRate
  integrations: [
    new BrowserTracing(),
    new ProfilingIntegration() // Add profiling integration
  ]
});
```

Sentry SDK will now automatically profile all transactions, even the ones which may be started as a result of using an automatic instrumentation integration.

```javascript
const transaction = Sentry.startTransaction({ name: 'I will do some work' });

// The code between startTransaction and transaction.finish will be profiled

transaction.finish();
```

## FAQ 💭
@TODO
