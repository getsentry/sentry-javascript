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

Then you can add the `SentryModule` as a root module. Also add the `SentryGlobalFilter` if you are not already using any
global catch-all exception filters (annotated with `@Catch()` and registered in your app module providers or with
`app.useGlobalFilters()`):

```typescript
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    SentryModule.forRoot(),
    // ...other modules
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
    // ..other providers
  ],
})
export class AppModule {}
```

The `SentryGlobalFilter` needs to be registered before any other exception filters.

If you are already using custom catch-all exception filters, do not add `SentryGlobalFilter` as a provider. Instead,
annotate the catch method in your catch-all exception filter with `WithSentry()`:

```typescript
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { SentryModule } from '@sentry/nestjs/setup';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CatchAllExceptionFilter } from './catch-all.filter';

@Module({
  imports: [
    SentryModule.forRoot(),
    // ...other modules
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: CatchAllExceptionFilter,
    },
    // ..other providers
  ],
})
export class AppModule {}
```

```typescript
import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { WithSentry } from '@sentry/nestjs';

@Catch()
export class CatchAllExceptionFilter implements ExceptionFilter {
  @WithSentry()
  catch(exception: BadRequestException, host: ArgumentsHost): void {
    // your implementation here
  }
}
```

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
