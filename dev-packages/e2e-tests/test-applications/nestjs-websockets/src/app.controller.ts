import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('/test-transaction')
  testTransaction() {
    return { message: 'ok' };
  }
}
