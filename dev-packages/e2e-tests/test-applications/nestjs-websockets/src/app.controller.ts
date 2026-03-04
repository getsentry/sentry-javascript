import { Controller, Get } from '@nestjs/common';
import { flush } from '@sentry/nestjs';

@Controller()
export class AppController {
  @Get('/flush')
  async flush() {
    await flush();
    return 'ok';
  }
}
