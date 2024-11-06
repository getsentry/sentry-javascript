import { Controller, Get, Param, ParseIntPipe, UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import { flush } from '@sentry/nestjs';
import { AppService } from './app.service';
import { AsyncInterceptor } from './async-example.interceptor';
import { ExampleInterceptor1 } from './example-1.interceptor';
import { ExampleInterceptor2 } from './example-2.interceptor';
import { ExampleExceptionGlobalFilter } from './example-global-filter.exception';
import { ExampleExceptionLocalFilter } from './example-local-filter.exception';
import { ExampleLocalFilter } from './example-local.filter';
import { ExampleGuard } from './example.guard';

@Controller()
@UseFilters(ExampleLocalFilter)
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
  @UseInterceptors(ExampleInterceptor1, ExampleInterceptor2)
  testInterceptorInstrumentation() {
    return this.appService.testSpan();
  }

  @Get('test-async-interceptor-instrumentation')
  @UseInterceptors(AsyncInterceptor)
  testAsyncInterceptorInstrumentation() {
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

  @Get('kill-test-cron/:job')
  async killTestCron(@Param('job') job: string) {
    this.appService.killTestCron(job);
  }

  @Get('flush')
  async flush() {
    await flush();
  }

  @Get('example-exception-global-filter')
  async exampleExceptionGlobalFilter() {
    throw new ExampleExceptionGlobalFilter();
  }

  @Get('example-exception-local-filter')
  async exampleExceptionLocalFilter() {
    throw new ExampleExceptionLocalFilter();
  }

  @Get('test-service-use')
  testServiceWithUseMethod() {
    return this.appService.use();
  }

  @Get('test-service-transform')
  testServiceWithTransform() {
    return this.appService.transform();
  }

  @Get('test-service-intercept')
  testServiceWithIntercept() {
    return this.appService.intercept();
  }

  @Get('test-service-canActivate')
  testServiceWithCanActivate() {
    return this.appService.canActivate();
  }

  @Get('test-function-name')
  testFunctionName() {
    return this.appService.getFunctionName();
  }
}
