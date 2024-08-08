import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter } from '@nestjs/common';
import { Request, Response } from 'express';
import { ExampleExceptionGlobalFilter } from "./example-global-filter.exception";

@Catch(ExampleExceptionGlobalFilter)
export class ExampleGlobalFilter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    console.log('Example global exception filter!');

    response.status(status).json({
      statusCode: 400,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: 'Example exception was handled by global filter!',
    });
  }
}
