import { Controller, Get } from '@nestjs/common';
import { ExampleException } from './example.exception';

@Controller('example-module')
export class ExampleController {
  constructor() {}

  @Get()
  getExampleException(): string {
    throw new ExampleException();
  }
}
