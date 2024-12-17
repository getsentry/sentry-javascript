<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for NestJS

[![npm version](https://img.shields.io/npm/v/@sentry/nestjs.svg)](https://www.npmjs.com/package/@sentry/nestjs)
[![npm dm](https://img.shields.io/npm/dm/@sentry/nestjs.svg)](https://www.npmjs.com/package/@sentry/nestjs)
[![npm dt](https://img.shields.io/npm/dt/@sentry/nestjs.svg)](https://www.npmjs.com/package/@sentry/nestjs)

## Installation

```bash
npm install @sentry/nestjs

# Or yarn
yarn add @sentry/nestjs
```

## Usage

Add an `instrument.ts` file:

```typescript
import * as Sentry from '@sentry/nestjs';

Sentry.init({
  dsn: '__DSN__',
  // ...
});
```

You need to require or import the `instrument.ts` file before requiring any other modules in your application. This is
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

Afterwards, add the `SentryModule` as a root module to your main module:

```typescript
import { Module } from '@nestjs/common';
import { SentryModule } from '@sentry/nestjs/setup';

@Module({
  imports: [
    SentryModule.forRoot(),
    // ...other modules
  ],
})
export class AppModule {}
```

In case you are using a global catch-all exception filter (which is either a filter registered with
`app.useGlobalFilters()` or a filter registered in your app module providers annotated with an empty `@Catch()`
decorator), add a `@SentryExceptionCaptured()` decorator to the `catch()` method of this global error filter. This
decorator will report all unexpected errors that are received by your global error filter to Sentry:

```typescript
import { Catch, ExceptionFilter } from '@nestjs/common';
import { SentryExceptionCaptured } from '@sentry/nestjs';

@Catch()
export class YourCatchAllExceptionFilter implements ExceptionFilter {
  @SentryExceptionCaptured()
  catch(exception, host): void {
    // your implementation here
  }
}
```

In case you do not have a global catch-all exception filter, add the `SentryGlobalFilter` to the providers of your main
module. This filter will report all unhandled errors that are not caught by any other error filter to Sentry.
**Important:** The `SentryGlobalFilter` needs to be registered before any other exception filters.

```typescript
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';

@Module({
  providers: [
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
    // ..other providers
  ],
})
export class AppModule {}
```

**Note:** In NestJS + GraphQL applications replace the `SentryGlobalFilter` with the `SentryGlobalGraphQLFilter`.

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
import type { MonitorConfig } from '@sentry/core';

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
