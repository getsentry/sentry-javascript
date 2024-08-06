import { Controller, Get, Param } from '@nestjs/common';
import { flush } from '@sentry/nestjs';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('test-exception/:id')
  async testException(@Param('id') id: string) {
    return this.appService.testException(id);
  }

  @Get('test-expected-exception/:id')
  async testExpectedException(@Param('id') id: string) {
    return this.appService.testExpectedException(id);
  }

  @Get('flush')
  async flush() {
    flush();
  }
}
