<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry Pino Transport

[![npm version](https://img.shields.io/npm/v/@sentry/solid.svg)](https://www.npmjs.com/package/@sentry/solid)
[![npm dm](https://img.shields.io/npm/dm/@sentry/solid.svg)](https://www.npmjs.com/package/@sentry/solid)
[![npm dt](https://img.shields.io/npm/dt/@sentry/solid.svg)](https://www.npmjs.com/package/@sentry/solid)

**WARNING**: This transport is in a **pre-release alpha**. The API is unstable and may change at any time.

A Pino transport for sending logs to Sentry using the Sentry JavaScript SDK.

This transport forwards Pino logs to Sentry, allowing you to view and analyze your application logs alongside your errors and performance data in Sentry.

## Installation

```bash
npm install @sentry/pino-transport pino
# or
yarn add @sentry/pino-transport pino
# or
pnpm add @sentry/pino-transport pino
```

## Requirements

- Node.js 18+
- Pino v8 or v9
- `@sentry/node` SDK with `enableLogs: true`

## Setup

First, make sure Sentry is initialized with logging enabled:

```javascript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'YOUR_DSN',
  enableLogs: true,
});
```

Then create a Pino logger with the Sentry transport:

```javascript
import pino from 'pino';

const logger = pino({
  transport: {
    target: '@sentry/pino-transport',
    options: {
      // Optional: filter which log levels to send to Sentry
      levels: ['error', 'fatal'], // defaults to all levels
    },
  },
});

// Now your logs will be sent to Sentry
logger.info('This is an info message');
logger.error('This is an error message');
```

## Configuration Options

The transport accepts the following options:

### `logLevels`

**Type:** `Array<'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'>`

**Default:** `['trace', 'debug', 'info', 'warn', 'error', 'fatal']` (all log levels)

Use this option to filter which log severity levels should be sent to Sentry.

```javascript
const transport = pino.transport({
  target: '@sentry/pino-transport',
  options: {
    logLevels: ['warn', 'error', 'fatal'], // Only send warnings and above
  },
});
```

## Log Level Mapping

Pino log levels are automatically mapped to Sentry log severity levels:

| Pino Level | Pino Numeric | Sentry Level |
| ---------- | ------------ | ------------ |
| trace      | 10           | trace        |
| debug      | 20           | debug        |
| info       | 30           | info         |
| warn       | 40           | warn         |
| error      | 50           | error        |
| fatal      | 60           | fatal        |

### Custom Levels Support

Custom numeric levels are mapped to Sentry levels using ranges, so levels like `11`, `23`, or `42` will map correctly:

- `0-19` → `trace`
- `20-29` → `debug`
- `30-39` → `info`
- `40-49` → `warn`
- `50-59` → `error`
- `60+` → `fatal`

```javascript
import pino from 'pino';

const logger = pino({
  customLevels: {
    critical: 55, // Maps to 'fatal' (55+ range)
    notice: 35, // Maps to 'warn' (35-44 range)
    verbose: 11, // Maps to 'trace' (0-14 range)
  },
  transport: {
    target: '@sentry/pino-transport',
  },
});

logger.critical('Critical issue occurred'); // → Sent as 'fatal' to Sentry
logger.notice('Important notice'); // → Sent as 'warn' to Sentry
logger.verbose('Detailed information'); // → Sent as 'trace' to Sentry
```

#### Custom Level Attributes

When using custom string levels, the original level name is preserved as `sentry.pino.level` attribute for better traceability:

```javascript
// Log entry in Sentry will include:
// {
//   level: 'warn',              // Mapped Sentry level
//   message: 'Audit event',
//   attributes: {
//     'sentry.pino.level': 'audit', // Original custom level name
//     'sentry.origin': 'auto.logging.pino',
//     // ... other log attributes
//   }
// }
```

### Custom Message Key

The transport respects Pino's `messageKey` configuration:

```javascript
const logger = pino({
  messageKey: 'message', // Use 'message' instead of default 'msg'
  transport: {
    target: '@sentry/pino-transport',
  },
});

logger.info({ message: 'Hello world' }); // Works correctly with custom messageKey
```

### Nested Key Support

The transport automatically supports Pino's `nestedKey` configuration, which is used to avoid property conflicts by nesting logged objects under a specific key. When `nestedKey` is configured, the transport flattens these nested properties using dot notation for better searchability in Sentry.

```javascript
const logger = pino({
  nestedKey: 'payload', // Nest logged objects under 'payload' key
  transport: {
    target: '@sentry/pino-transport',
  },
});

const conflictingObject = {
  level: 'hi', // Conflicts with Pino's level
  time: 'never', // Conflicts with Pino's time
  foo: 'bar',
  userId: 123,
};

logger.info(conflictingObject);

// Without nestedKey, this would cause property conflicts
// With nestedKey, Pino creates: { level: 30, time: 1234567890, payload: conflictingObject }
// The transport flattens it to:
// {
//   level: 'info',
//   message: undefined,
//   attributes: {
//     'payload.level': 'hi',    // Flattened nested properties
//     'payload.time': 'never',
//     'payload.foo': 'bar',
//     'payload.userId': 123,
//     'sentry.origin': 'auto.logging.pino',
//   }
// }
```

This flattening ensures that no property conflicts occur between logged objects and Pino's internal properties.

## Usage Examples

### Basic Logging

```javascript
import pino from 'pino';

const logger = pino({
  transport: {
    target: '@sentry/pino-transport',
  },
});

logger.trace('Starting application');
logger.debug('Debug information', { userId: 123 });
logger.info('User logged in', { userId: 123, username: 'john_doe' });
logger.warn('Deprecated API used', { endpoint: '/old-api' });
logger.error('Database connection failed', { error: 'Connection timeout' });
logger.fatal('Application crashed', { reason: 'Out of memory' });
```

### Multiple Transports

```javascript
import pino from 'pino';

const logger = pino({
  transport: {
    targets: [
      {
        target: 'pino-pretty',
        options: { colorize: true },
        level: 'debug',
      },
      {
        target: '@sentry/pino-transport',
        options: {
          logLevels: ['warn', 'error', 'fatal'],
        },
        level: 'warn',
      },
    ],
  },
});
```

## Troubleshooting

### Logs not appearing in Sentry

1. Ensure `enableLogs: true` is set in your Sentry configuration.
2. Check that your DSN is correct and the SDK is properly initialized.
3. Verify the log level is included in the `levels` configuration.
4. Check your Sentry organization stats page to see if logs are being received by Sentry.

## Related Documentation

- [Sentry Logs Documentation](https://docs.sentry.io/platforms/javascript/guides/node/logs/)
- [Pino Documentation](https://getpino.io/)
- [Pino Transports](https://getpino.io/#/docs/transports)

## License

MIT
