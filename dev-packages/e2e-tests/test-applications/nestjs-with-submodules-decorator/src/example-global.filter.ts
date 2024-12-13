import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter } from '@nestjs/common';
import { SentryExceptionCaptured } from '@sentry/nestjs';
import { Request, Response } from 'express';

@Catch()
export class ExampleWrappedGlobalFilter implements ExceptionFilter {
  @SentryExceptionCaptured()
  catch(exception: BadRequestException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    response.status(501).json({
      statusCode: 501,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: 'Example exception was handled by global filter!',
    });
  }
}
