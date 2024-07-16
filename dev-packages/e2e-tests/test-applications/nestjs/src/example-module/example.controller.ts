import { Controller, Get } from '@nestjs/common';
import { ExampleException } from './example.exception';

@Controller('test-module')
export class ExampleController {
  constructor() {}

  @Get()
  getTest(): string {
    throw new ExampleException();
  }
}
