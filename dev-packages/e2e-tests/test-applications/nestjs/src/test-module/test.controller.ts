import { Controller, Get } from '@nestjs/common';
import { TestException } from './test.exception';

@Controller('test-module')
export class TestController {
  constructor() {}

  @Get()
  getTest(): string {
    throw new TestException();
  }
}
