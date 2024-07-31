import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { ExampleGuard } from './example.guard';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('test-transaction')
  testTransaction() {
    return this.appService.testTransaction();
  }

  @Get('test-middleware-instrumentation')
  testMiddlewareInstrumentation() {
    return this.appService.testMiddleware();
  }

  @Get('test-guard-instrumentation')
  @UseGuards(ExampleGuard)
  testGuardInstrumentation() {
    return {};
  }

  @Get('test-pipe-instrumentation')
  testPipeInstrumentation(@Param('id', ParseIntPipe) id: number) {
    return { value: id };
  }

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

  @Get('test-span-decorator-async')
  async testSpanDecoratorAsync() {
    return { result: await this.appService.testSpanDecoratorAsync() };
  }

  @Get('test-span-decorator-sync')
  async testSpanDecoratorSync() {
    return { result: await this.appService.testSpanDecoratorSync() };
  }

  @Get('kill-test-cron')
  async killTestCron() {
    this.appService.killTestCron();
  }
}
