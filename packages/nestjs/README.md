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

Add a instrument.ts file:

```typescript
import * as Sentry from '@sentry/nestjs';

Sentry.init({
  dsn: '__DSN__',
  // ...
});
```

You need to require or import the instrument.js file before requiring any other modules in your application. This is
necessary to ensure that Sentry can automatically instrument all modules in your application:

```typescript
// Import this first!
import './instrument';

// Now import other modules
import * as Sentry from '@sentry/nestjs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
}

bootstrap();
```

Then you can add the `SentryModule` as a root module:

```typescript
import { Module } from '@nestjs/common';
import { SentryModule } from '@sentry/nestjs/setup';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    SentryModule.forRoot(),
    // ...other modules
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

The `SentryModule` needs to be registered before any module that should be instrumented by Sentry.

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
