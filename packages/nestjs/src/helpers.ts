/**
 * Determines if the exception is an expected NestJS control flow error.
 * - HttpException have getStatus and getResponse methods: https://github.com/nestjs/nest/blob/master/packages/microservices/exceptions/rpc-exception.ts
 * - RpcException have getError and initMessage methods: https://github.com/nestjs/nest/blob/master/packages/common/exceptions/http.exception.ts
 * - WsException has getError and initMessage in current Nest versions, but we also accept a WsException-shaped fallback
 *   identified by constructor name to avoid reporting control-flow websocket exceptions.
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
  if (
    typeof ex.getStatus === 'function' &&
    typeof ex.getResponse === 'function' &&
    typeof ex.initMessage === 'function'
  ) {
    return true;
  }

  // RpcException / WsException (current Nest versions)
  if (typeof ex.getError === 'function' && typeof ex.initMessage === 'function') {
    return true;
  }

  // WsException fallback (older/custom variants may not expose initMessage)
  if (typeof ex.getError === 'function' && ex.constructor?.name === 'WsException') {
    return true;
  }

  return false;
}
