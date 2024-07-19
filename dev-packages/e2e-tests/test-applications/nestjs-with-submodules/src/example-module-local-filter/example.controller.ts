import { Controller, Get, UseFilters } from '@nestjs/common';
import { LocalExampleException } from './example.exception';
import { LocalExampleExceptionFilter } from './example.filter';

@Controller('example-module-local-filter')
@UseFilters(LocalExampleExceptionFilter)
export class ExampleControllerLocalFilter {
  constructor() {}

  @Get()
  getExampleException() {
    throw new LocalExampleException();
  }
}
