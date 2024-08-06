import { ArgumentsHost, BadRequestException, Catch } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { ExampleException } from './example.exception';

@Catch(ExampleException)
export class ExampleExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    if (exception instanceof ExampleException) {
      console.log('catch example exception!');
      return super.catch(new BadRequestException(exception.message), host);
    }
    return super.catch(exception, host);
  }
}
