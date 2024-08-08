import { Controller, Get, Param, ParseIntPipe, UseGuards, UseInterceptors } from '@nestjs/common';
import { flush } from '@sentry/nestjs';
import { AppService } from './app.service';
import { ExampleExceptionWithFilter } from './example-with-filter.exception';
import { ExampleGuard } from './example.guard';
import { ExampleInterceptor } from './example.interceptor';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('test-transaction')
  testTransaction() {
    return this.appService.testTransaction();
  }

  @Get('test-middleware-instrumentation')
  testMiddlewareInstrumentation() {
    return this.appService.testSpan();
  }

  @Get('test-guard-instrumentation')
  @UseGuards(ExampleGuard)
  testGuardInstrumentation() {
    return {};
  }

  @Get('test-interceptor-instrumentation')
  @UseInterceptors(ExampleInterceptor)
  testInterceptorInstrumentation() {
    return this.appService.testSpan();
  }

  @Get('test-pipe-instrumentation/:id')
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

  @Get('test-expected-rpc-exception/:id')
  async testExpectedRpcException(@Param('id') id: string) {
    return this.appService.testExpectedRpcException(id);
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

  @Get('flush')
  async flush() {
    await flush();
  }

  @Get('example-exception-with-filter')
  async exampleExceptionWithFilter() {
    throw new ExampleExceptionWithFilter();
  }
}
