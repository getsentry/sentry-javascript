/**
 * Determines if the exception is an expected NestJS control flow error.
 * - HttpException have getStatus and getResponse methods: https://github.com/nestjs/nest/blob/master/packages/microservices/exceptions/rpc-exception.ts
 * - RpcException have getError and initMessage methods: https://github.com/nestjs/nest/blob/master/packages/common/exceptions/http.exception.ts
 *
 * We cannot use `instanceof HttpException` here because this file is imported
 * from the main entry point (via decorators.ts), and importing @nestjs/common at that
 * point would load it before OpenTelemetry instrumentation can patch it, breaking instrumentations.
 *
 * @returns `true` if the exception is expected and should not be reported to Sentry, otherwise `false`.
 */
export function isExpectedError(exception: unknown): boolean {
  if (typeof exception !== 'object' || exception === null) {
    return false;
  }

  const ex = exception as Record<string, unknown>;

  // HttpException
  if (typeof ex.getStatus === 'function' && typeof ex.getResponse === 'function') {
    return true;
  }

  // RpcException
  if (typeof ex.getError === 'function' && typeof ex.initMessage === 'function') {
    return true;
  }

  return false;
}
