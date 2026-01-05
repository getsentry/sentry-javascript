import { b as getActiveSpan, an as startSpanManual, ar as addNonEnumerableProperty, bq as getMiddlewareSpanOptions, aV as withActiveSpan } from "../server.js";
const SENTRY_WRAPPED = "__SENTRY_WRAPPED__";
function getNextProxy(next, span, prevSpan) {
  return new Proxy(next, {
    apply: (originalNext, thisArgNext, argsNext) => {
      span.end();
      if (prevSpan) {
        return withActiveSpan(prevSpan, () => {
          return Reflect.apply(originalNext, thisArgNext, argsNext);
        });
      }
      return Reflect.apply(originalNext, thisArgNext, argsNext);
    }
  });
}
function wrapMiddlewareWithSentry(middleware, options) {
  if (middleware[SENTRY_WRAPPED]) {
    return middleware;
  }
  if (middleware.options?.server) {
    middleware.options.server = new Proxy(middleware.options.server, {
      apply: (originalServer, thisArgServer, argsServer) => {
        const prevSpan = getActiveSpan();
        return startSpanManual(getMiddlewareSpanOptions(options.name), (span) => {
          const middlewareArgs = argsServer[0];
          if (middlewareArgs && typeof middlewareArgs === "object" && typeof middlewareArgs.next === "function") {
            middlewareArgs.next = getNextProxy(middlewareArgs.next, span, prevSpan);
          }
          return originalServer.apply(thisArgServer, argsServer);
        });
      }
    });
    addNonEnumerableProperty(middleware, SENTRY_WRAPPED, true);
  }
  return middleware;
}
function wrapMiddlewareListWithSentry(middlewares) {
  return Object.entries(middlewares).map(([name, middleware]) => {
    return wrapMiddlewareWithSentry(middleware, { name });
  });
}
const createMiddleware = (options, __opts) => {
  const resolvedOptions = {
    type: "request",
    ...__opts || options
  };
  return {
    options: resolvedOptions,
    middleware: (middleware) => {
      return createMiddleware(
        {},
        Object.assign(resolvedOptions, { middleware })
      );
    },
    inputValidator: (inputValidator) => {
      return createMiddleware(
        {},
        Object.assign(resolvedOptions, { inputValidator })
      );
    },
    client: (client) => {
      return createMiddleware(
        {},
        Object.assign(resolvedOptions, { client })
      );
    },
    server: (server) => {
      return createMiddleware(
        {},
        Object.assign(resolvedOptions, { server })
      );
    }
  };
};
const globalRequestMiddleware = createMiddleware().server(async ({ next }) => {
  console.log("Global request middleware executed");
  return next();
});
const globalFunctionMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  console.log("Global function middleware executed");
  return next();
});
const serverFnMiddleware = createMiddleware({ type: "function" }).server(async ({ next }) => {
  console.log("Server function middleware executed");
  return next();
});
const serverRouteRequestMiddleware = createMiddleware().server(async ({ next }) => {
  console.log("Server route request middleware executed");
  return next();
});
const wrappedGlobalRequestMiddleware = wrapMiddlewareWithSentry(globalRequestMiddleware, {
  name: "globalRequestMiddleware"
});
const wrappedGlobalFunctionMiddleware = wrapMiddlewareWithSentry(globalFunctionMiddleware, {
  name: "globalFunctionMiddleware"
});
const [wrappedServerFnMiddleware, wrappedServerRouteRequestMiddleware] = wrapMiddlewareListWithSentry({
  serverFnMiddleware,
  serverRouteRequestMiddleware
});
export {
  wrappedGlobalFunctionMiddleware as a,
  wrappedGlobalRequestMiddleware as b,
  createMiddleware as c,
  wrappedServerFnMiddleware as d,
  wrappedServerRouteRequestMiddleware as w
};
