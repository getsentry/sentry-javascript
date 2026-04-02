import {
  captureException,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  startSpan,
  withIsolationScope,
} from '@sentry/core';

type ServerComponentContext = {
  componentRoute: string;
  componentType: string;
};

/**
 * Wraps a vinext App Router route handler with Sentry instrumentation.
 */
export function wrapRouteHandlerWithSentry<T extends (...args: unknown[]) => unknown>(
  handler: T,
  method: string,
  parameterizedRoute: string,
): T {
  return async function sentryWrappedRouteHandler(this: unknown, ...args: unknown[]) {
    return withIsolationScope(async isolationScope => {
      isolationScope.setTransactionName(`${method} ${parameterizedRoute}`);

      return startSpan(
        {
          name: `${method} ${parameterizedRoute}`,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.vinext',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
            'http.method': method,
          },
        },
        async () => {
          try {
            return await handler.apply(this, args);
          } catch (error) {
            captureException(error, {
              mechanism: {
                handled: false,
                type: 'auto.function.vinext.route_handler',
              },
            });
            throw error;
          }
        },
      );
    });
  } as unknown as T;
}

/**
 * Wraps a vinext App Router server component with Sentry instrumentation.
 */
export function wrapServerComponentWithSentry<T extends (...args: unknown[]) => unknown>(
  component: T,
  context: ServerComponentContext,
): T {
  const { componentRoute, componentType } = context;

  return async function sentryWrappedServerComponent(this: unknown, ...args: unknown[]) {
    return withIsolationScope(async isolationScope => {
      isolationScope.setTransactionName(componentRoute);

      return startSpan(
        {
          name: `${componentType} ${componentRoute}`,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: `ui.${componentType}.render`,
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.vinext',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
            'vinext.component_type': componentType,
          },
        },
        async () => {
          try {
            return await component.apply(this, args);
          } catch (error) {
            captureException(error, {
              mechanism: {
                handled: false,
                type: 'auto.function.vinext.server_component',
              },
            });
            throw error;
          }
        },
      );
    });
  } as unknown as T;
}

/**
 * Wraps a vinext middleware function with Sentry instrumentation.
 */
export function wrapMiddlewareWithSentry<T extends (...args: unknown[]) => unknown>(middleware: T): T {
  return async function sentryWrappedMiddleware(this: unknown, ...args: unknown[]) {
    return withIsolationScope(async isolationScope => {
      // Try to extract the path from the first argument (Request object)
      const request = args[0] as { url?: string; method?: string } | undefined;
      let requestPath = '/';
      let method = 'GET';

      if (request?.url) {
        try {
          const url = new URL(request.url);
          requestPath = url.pathname;
        } catch {
          // noop
        }
      }
      if (request?.method) {
        method = request.method;
      }

      isolationScope.setTransactionName(`middleware ${method} ${requestPath}`);

      return startSpan(
        {
          name: `middleware ${method} ${requestPath}`,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server.middleware',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.vinext.middleware',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
          },
        },
        async () => {
          try {
            return await middleware.apply(this, args);
          } catch (error) {
            captureException(error, {
              mechanism: {
                handled: false,
                type: 'auto.function.vinext.middleware',
              },
            });
            throw error;
          }
        },
      );
    });
  } as unknown as T;
}

/**
 * Wraps a vinext Pages Router API handler with Sentry instrumentation.
 */
export function wrapApiHandlerWithSentry<T extends (...args: unknown[]) => unknown>(
  handler: T,
  parameterizedRoute: string,
): T {
  return async function sentryWrappedApiHandler(this: unknown, ...args: unknown[]) {
    return withIsolationScope(async isolationScope => {
      // Try to extract the method from the first argument (IncomingMessage)
      const req = args[0] as { method?: string } | undefined;
      const method = req?.method || 'GET';

      isolationScope.setTransactionName(`${method} ${parameterizedRoute}`);

      return startSpan(
        {
          name: `${method} ${parameterizedRoute}`,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'http.server',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.http.vinext.api_route',
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
            'http.method': method,
          },
        },
        async () => {
          try {
            return await handler.apply(this, args);
          } catch (error) {
            captureException(error, {
              mechanism: {
                handled: false,
                type: 'auto.function.vinext.api_route',
              },
            });
            throw error;
          }
        },
      );
    });
  } as unknown as T;
}
