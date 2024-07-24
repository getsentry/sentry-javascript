import { Controller, Get } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import { ExampleException } from './example.exception';

@Controller('example-module')
export class ExampleController {
  constructor() {}

  @Get('/expected-exception')
  getCaughtException(): string {
    throw new ExampleException();
  }

  @Get('/unexpected-exception')
  getUncaughtException(): string {
    throw new Error(`This is an uncaught exception!`);
  }

  @Get('/transaction')
  testTransaction() {
    Sentry.startSpan({ name: 'test-span' }, () => {
      Sentry.startSpan({ name: 'child-span' }, () => {});
    });
  }
}
