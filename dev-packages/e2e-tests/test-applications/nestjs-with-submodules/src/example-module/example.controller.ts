import { Controller, Get } from '@nestjs/common';
import { ExampleException } from './example.exception';

@Controller('example-module')
export class ExampleController {
  constructor() {}

  @Get()
  getTest(): string {
    throw new ExampleException();
  }
}
