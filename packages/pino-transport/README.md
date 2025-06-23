# @sentry/pino-transport

[![npm version](https://img.shields.io/npm/v/@sentry/pino-transport.svg)](https://www.npmjs.com/package/@sentry/pino-transport)
[![npm dm](https://img.shields.io/npm/dm/@sentry/pino-transport.svg)](https://www.npmjs.com/package/@sentry/pino-transport)
[![npm dt](https://img.shields.io/npm/dt/@sentry/pino-transport.svg)](https://www.npmjs.com/package/@sentry/pino-transport)

**This package is currently in alpha. Breaking changes may still occur.**

A Pino transport for integrating [Pino](https://github.com/pinojs/pino) logging with [Sentry](https://sentry.io). This transport automatically captures log messages as Sentry events and breadcrumbs, making it easy to monitor your application's logs in Sentry.

## Installation

```bash
npm install @sentry/node @sentry/pino-transport
# or
yarn add @sentry/node @sentry/pino-transport
```

## Usage

TODO: Add usage instructions

## Requirements

- Node.js 18 or higher
- Pino 8.0.0 or higher
- @sentry/node must be configured in your application

## License

MIT
