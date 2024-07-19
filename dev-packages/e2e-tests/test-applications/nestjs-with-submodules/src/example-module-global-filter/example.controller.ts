import { Controller, Get } from '@nestjs/common';
import { ExampleException } from './example.exception';

@Controller('example-module')
export class ExampleController {
  constructor() {}

  @Get('/expected-exception')
  getCaughtException(): string {
    throw new ExampleException();
  }

  @Get('/unexpected-exception')
  getUncaughtException(): string {
    throw new Error(`This is an uncaught exception!`);
  }
}
