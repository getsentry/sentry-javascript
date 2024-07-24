import { Controller, Get } from '@nestjs/common';
import { ExampleExceptionWrongRegistrationOrder } from './example.exception';

@Controller('example-module-wrong-order')
export class ExampleController {
  constructor() {}

  @Get('/expected-exception')
  getCaughtException(): string {
    throw new ExampleExceptionWrongRegistrationOrder();
  }

  @Get('/unexpected-exception')
  getUncaughtException(): string {
    throw new Error(`This is an uncaught exception!`);
  }
}
