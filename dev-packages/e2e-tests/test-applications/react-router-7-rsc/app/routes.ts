import { type RouteConfig, index, prefix, route } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
  ...prefix('rsc', [
    // RSC Server Component tests
    route('server-component', 'routes/rsc/server-component.tsx'),
    route('server-component-error', 'routes/rsc/server-component-error.tsx'),
    route('server-component-async', 'routes/rsc/server-component-async.tsx'),
    route('server-component-redirect', 'routes/rsc/server-component-redirect.tsx'),
    route('server-component-not-found', 'routes/rsc/server-component-not-found.tsx'),
    route('server-component/:param', 'routes/rsc/server-component-param.tsx'),
    // RSC Server Function tests
    route('server-function', 'routes/rsc/server-function.tsx'),
    route('server-function-error', 'routes/rsc/server-function-error.tsx'),
  ]),
  ...prefix('performance', [
    index('routes/performance/index.tsx'),
    route('with/:param', 'routes/performance/dynamic-param.tsx'),
  ]),
] satisfies RouteConfig;
