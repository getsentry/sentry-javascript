// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck These are only tests
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
import { loggingTransport, sendPortToRunner } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 1.0,
  transport: loggingTransport,
});

import { Controller, Get, Injectable, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

const port = 3450;

// Stop the process from exiting before the transaction is sent
// eslint-disable-next-line @typescript-eslint/no-empty-function
setInterval(() => {}, 1000);

@Injectable()
class AppService {
  getHello(): string {
    return 'Hello World!';
  }
}

@Controller()
class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService],
})
class AppModule {}

async function init(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  await app.listen(port);
  sendPortToRunner(port);
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
init();
