<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for NestJS (EXPERIMENTAL)

[![npm version](https://img.shields.io/npm/v/@sentry/nestjs.svg)](https://www.npmjs.com/package/@sentry/nestjs)
[![npm dm](https://img.shields.io/npm/dm/@sentry/nestjs.svg)](https://www.npmjs.com/package/@sentry/nestjs)
[![npm dt](https://img.shields.io/npm/dt/@sentry/nestjs.svg)](https://www.npmjs.com/package/@sentry/nestjs)

This SDK is considered **experimental and in an alpha state**. It may experience breaking changes. Please reach out on
[GitHub](https://github.com/getsentry/sentry-javascript/issues/new/choose) if you have any feedback or concerns.

## Installation

```bash
npm install @sentry/nestjs

# Or yarn
yarn add @sentry/nestjs
```

## Usage

```typescript
// CJS Syntax
const Sentry = require('@sentry/nestjs');
// ESM Syntax
import * as Sentry from '@sentry/nestjs';

Sentry.init({
  dsn: '__DSN__',
  // ...
});
```

Note that it is necessary to initialize Sentry **before you import any package that may be instrumented by us**.

## SentryTraced

Use the `@SentryTraced()` decorator to gain additional performance insights for any function within your NestJS
applications.

```typescript
import { Injectable } from '@nestjs/common';
import { SentryTraced } from '@sentry/nestjs';

@Injectable()
export class ExampleService {
  @SentryTraced('example function')
  async performTask() {
    // Your business logic here
  }
}
```

## SentryCron

Use the `@SentryCron()` decorator to augment the native NestJS `@Cron` decorator to send check-ins to Sentry before and
after each cron job run.

```typescript
import { Cron } from '@nestjs/schedule';
import { SentryCron, MonitorConfig } from '@sentry/nestjs';
import type { MonitorConfig } from '@sentry/types';

const monitorConfig: MonitorConfig = {
  schedule: {
    type: 'crontab',
    value: '* * * * *',
  },
  checkinMargin: 2, // In minutes. Optional.
  maxRuntime: 10, // In minutes. Optional.
  timezone: 'America/Los_Angeles', // Optional.
};

export class MyCronService {
  @Cron('* * * * *')
  @SentryCron('my-monitor-slug', monitorConfig)
  handleCron() {
    // Your cron job logic here
  }
}
```

## Links

- [Official SDK Docs](https://docs.sentry.io/platforms/javascript/guides/nestjs/)
