import { ArgumentsHost, BadRequestException, Catch } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { LocalExampleException } from './example.exception';

@Catch(LocalExampleException)
export class LocalExampleExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    if (exception instanceof LocalExampleException) {
      return super.catch(new BadRequestException(exception.message), host);
    }
    return super.catch(exception, host);
  }
}
