import { ArgumentsHost, BadRequestException, Catch } from '@nestjs/common';
import { TestException } from './test.exception';
import { BaseExceptionFilter } from '@nestjs/core';

@Catch(TestException)
export class TestExceptionFilter extends BaseExceptionFilter {
  catch (exception: unknown, host: ArgumentsHost) {
    if (exception instanceof TestException) {
      return super.catch(new BadRequestException(exception.message), host);
    }
    return super.catch(exception, host);
  }
}
