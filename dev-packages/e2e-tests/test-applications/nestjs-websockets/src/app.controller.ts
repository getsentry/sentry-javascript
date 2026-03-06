import { Controller, Get } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

@Controller()
export class AppController {
  @Get('/test-transaction')
  testTransaction() {
    return { message: 'ok' };
  }

  @Get('/flush')
  async flush() {
    await Sentry.flush(2000);
    return { message: 'ok' };
  }
}
