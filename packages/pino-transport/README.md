# Sentry Pino Transport

A Pino transport for sending logs to Sentry using the Sentry JavaScript SDK.

This transport forwards Pino logs to Sentry, allowing you to view and analyze your application logs alongside your errors and performance data in Sentry.

## Installation

```bash
npm install @sentry/pino-transport pino
# or
yarn add @sentry/pino-transport pino
```

## Requirements

- Node.js 18+
- Pino v8 or v9
- `@sentry/node` SDK with `_experiments.enableLogs: true`

## Setup

First, make sure Sentry is initialized with logging enabled:

```javascript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'YOUR_DSN',
  _experiments: {
    enableLogs: true,
  },
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

### Programmatic Usage

You can also create the transport programmatically:

```javascript
import pino from 'pino';
import { createSentryPinoTransport } from '@sentry/pino-transport';

const transport = pino.transport({
  targets: [
    {
      target: 'pino-pretty', // Console output
      level: 'info',
    },
    {
      target: createSentryPinoTransport,
      level: 'error',
      options: {
        levels: ['error', 'fatal'], // Only send errors and fatal logs to Sentry
      },
    },
  ],
});

const logger = pino(transport);
```

## Configuration Options

The transport accepts the following options:

### `levels`

**Type:** `Array<'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'>`
**Default:** `['trace', 'debug', 'info', 'warn', 'error', 'fatal']` (all levels)

Use this option to filter which log levels should be sent to Sentry.

```javascript
const transport = pino.transport({
  target: '@sentry/pino-transport',
  options: {
    levels: ['warn', 'error', 'fatal'], // Only send warnings and above
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

- `0-14` → `trace`
- `15-24` → `debug`
- `25-34` → `info`
- `35-44` → `warn`
- `45-54` → `error`
- `55+` → `fatal`

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

1. Ensure `_experiments.enableLogs: true` is set in your Sentry configuration.
2. Check that your DSN is correct and the SDK is properly initialized.
3. Verify the log level is included in the `levels` configuration.
4. Check your Sentry organization stats page to see if logs are being received by Sentry.

## Related Documentation

- [Sentry Logs Documentation](https://docs.sentry.io/platforms/javascript/guides/node/logs/)
- [Pino Documentation](https://getpino.io/)
- [Pino Transports](https://getpino.io/#/docs/transports)

## License

MIT
