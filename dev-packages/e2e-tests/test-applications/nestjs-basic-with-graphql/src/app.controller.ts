import { Controller, Get, Param } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('test-exception/:id')
  async testException(@Param('id') id: string) {
    return this.appService.testException(id);
  }

  @Get('test-expected-400-exception/:id')
  async testExpected400Exception(@Param('id') id: string) {
    return this.appService.testExpected400Exception(id);
  }

  @Get('test-expected-500-exception/:id')
  async testExpected500Exception(@Param('id') id: string) {
    return this.appService.testExpected500Exception(id);
  }
}
