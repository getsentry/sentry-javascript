import { Controller, Get, UseFilters } from '@nestjs/common';
import { LocalExampleException } from './example.exception';
import { LocalExampleExceptionFilter } from './example.filter';

@Controller('example-module-local-filter')
@UseFilters(LocalExampleExceptionFilter)
export class ExampleControllerLocalFilter {
  constructor() {}

  @Get('/expected-exception')
  getCaughtException() {
    throw new LocalExampleException();
  }

  @Get('/unexpected-exception')
  getUncaughtException(): string {
    throw new Error(`This is an uncaught exception!`);
  }
}
