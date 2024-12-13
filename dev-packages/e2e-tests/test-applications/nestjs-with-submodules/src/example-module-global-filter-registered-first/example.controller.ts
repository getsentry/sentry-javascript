import { Controller, Get } from '@nestjs/common';
import { ExampleExceptionRegisteredFirst } from './example.exception';

@Controller('example-module-registered-first')
export class ExampleController {
  constructor() {}

  @Get('/expected-exception')
  getCaughtException(): string {
    throw new ExampleExceptionRegisteredFirst();
  }

  @Get('/unexpected-exception')
  getUncaughtException(): string {
    throw new Error(`This is an uncaught exception!`);
  }
}
