import { Controller, Get, Param } from '@nestjs/common';
import { flush } from '@sentry/nestjs';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('test-transaction')
  testTransaction() {
    return this.appService.testTransaction();
  }

  @Get('test-exception/:id')
  async testException(@Param('id') id: string) {
    return this.appService.testException(id);
  }

  @Get('flush')
  async flush() {
    await flush();
  }
}
