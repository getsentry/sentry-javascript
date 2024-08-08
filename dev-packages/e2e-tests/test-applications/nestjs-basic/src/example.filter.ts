import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter } from '@nestjs/common';
import { Request, Response } from 'express';
import { ExampleExceptionWithFilter } from './example-with-filter.exception';

@Catch(ExampleExceptionWithFilter)
export class ExampleExceptionFilter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    console.log('Example exception filter!');

    response.status(status).json({
      statusCode: 400,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: 'Example exception was handled by filter!',
    });
  }
}
