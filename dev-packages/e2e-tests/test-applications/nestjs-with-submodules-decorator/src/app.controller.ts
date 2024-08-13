import { Controller, Get, Param, UseFilters } from '@nestjs/common';
import { flush } from '@sentry/nestjs';
import { AppService } from './app.service';
import { ExampleExceptionLocalFilter } from './example-local.exception';
import { ExampleLocalFilter } from './example-local.filter';
import { ExampleExceptionSpecificFilter } from './example-specific.exception';

@Controller()
@UseFilters(ExampleLocalFilter)
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
    await flush();
  }

  @Get('example-exception-specific-filter')
  async exampleExceptionGlobalFilter() {
    throw new ExampleExceptionSpecificFilter();
  }

  @Get('example-exception-local-filter')
  async exampleExceptionLocalFilter() {
    throw new ExampleExceptionLocalFilter();
  }
}
