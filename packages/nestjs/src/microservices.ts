import type { ArgumentsHost, HttpServer } from '@nestjs/common';
import { Catch, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { captureException } from '@sentry/core';
import { SentryGlobalFilter } from './setup';
import { isExpectedError } from './helpers';

/**
 * Global filter to handle exceptions and report them to Sentry in nestjs microservice applications.
 * Extends the standard SentryGlobalFilter with RPC exception handling.
 *
 * @example
 * ```
 * import { Module } from '@nestjs/common';
 * import { APP_FILTER } from '@nestjs/core';
 * import { SentryRpcFilter } from '@sentry/nestjs/microservices';
 *
 * @Module({
 *   providers: [
 *     // For microservice applications this filter replaces SentryGlobalFilter
 *     {
 *       provide: APP_FILTER,
 *       useClass: SentryRpcFilter,
 *     },
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
class SentryRpcFilter extends SentryGlobalFilter {
  private readonly _rpcLogger: Logger;

  public constructor(applicationRef?: HttpServer) {
    super(applicationRef);
    this._rpcLogger = new Logger('RpcExceptionsHandler');
  }

  /**
   * Extend the base filter with RPC-specific handling.
   */
  public catch(exception: unknown, host: ArgumentsHost): void {
    const contextType = host.getType<string>();

    if (contextType === 'rpc') {
      // Don't report RpcExceptions as they are expected errors
      if (exception instanceof RpcException) {
        throw exception;
      }

      if (!isExpectedError(exception)) {
        if (exception instanceof Error) {
          this._rpcLogger.error(exception.message, exception.stack);
        }
        captureException(exception);
      }

      // Wrap non-RpcExceptions in RpcExceptions to avoid misleading error messages
      if (!(exception instanceof RpcException)) {
        const errorMessage = exception instanceof Error ? exception.message : 'Internal server error';
        throw new RpcException(errorMessage);
      }

      throw exception;
    }

    // For all other context types, use the base SentryGlobalFilter filter
    return super.catch(exception, host);
  }
}
Catch()(SentryRpcFilter);
export { SentryRpcFilter };
