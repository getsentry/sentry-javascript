import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Response } from 'express';
import { ExampleException } from './example.exception';

// `@Catch` exercises the exception_filter instrumentation.
@Catch(ExampleException)
export class ExampleExceptionFilter implements ExceptionFilter {
  public catch(_exception: ExampleException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.status(400).json({ message: 'handled by example filter' });
  }
}
