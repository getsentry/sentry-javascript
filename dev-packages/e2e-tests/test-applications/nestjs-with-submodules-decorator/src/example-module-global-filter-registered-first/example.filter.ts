import { ArgumentsHost, BadRequestException, Catch } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { ExampleExceptionRegisteredFirst } from './example.exception';

@Catch(ExampleExceptionRegisteredFirst)
export class ExampleExceptionFilterRegisteredFirst extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    if (exception instanceof ExampleExceptionRegisteredFirst) {
      return super.catch(new BadRequestException(exception.message), host);
    }
    return super.catch(exception, host);
  }
}
