/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
import { loggingTransport, sendPortToRunner } from '@sentry-internal/node-integration-tests';
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  release: '1.0',
  tracesSampleRate: 0,
  transport: loggingTransport,
});

import { Controller, Get, Injectable, Module, Param } from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost, NestFactory } from '@nestjs/core';

const port = 3460;

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

  @Get('test-exception/:id')
  async testException(@Param('id') id: string): Promise<void> {
    Sentry.captureException(new Error(`error with id ${id}`));
  }
}

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService],
})
class AppModule {}

async function run(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const { httpAdapter } = app.get(HttpAdapterHost);
  // eslint-disable-next-line deprecation/deprecation
  Sentry.setupNestErrorHandler(app, new BaseExceptionFilter(httpAdapter));
  await app.listen(port);
  sendPortToRunner(port);
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run();
