import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { ExampleExceptionLocalFilter } from './example-local-filter.exception';

@Catch(ExampleExceptionLocalFilter)
export class ExampleLocalFilter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    response.status(400).send({
      statusCode: 400,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: 'Example exception was handled by local filter!',
    });
  }
}
