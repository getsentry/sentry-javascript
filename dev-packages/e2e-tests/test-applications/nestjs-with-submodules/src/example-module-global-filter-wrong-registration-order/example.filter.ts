import { ArgumentsHost, BadRequestException, Catch } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { ExampleExceptionWrongRegistrationOrder } from './example.exception';

@Catch(ExampleExceptionWrongRegistrationOrder)
export class ExampleExceptionFilterWrongRegistrationOrder extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    if (exception instanceof ExampleExceptionWrongRegistrationOrder) {
      return super.catch(new BadRequestException(exception.message), host);
    }
    return super.catch(exception, host);
  }
}
