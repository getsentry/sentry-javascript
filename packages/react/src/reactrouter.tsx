import { Transaction, TransactionContext } from '@sentry/types';

type routingInstrumentation = (
  startTransaction: (context: TransactionContext) => Transaction,
  startTransactionOnPageLoad?: boolean,
  startTransactionOnLocationChange?: boolean,
) => void;

// Many of the types below had to be mocked out to lower bundle size.
type PlainRoute = { path: string; childRoutes: PlainRoute[] };

type Match = (
  props: { location: Location; routes: PlainRoute[] },
  cb: (error?: Error, _redirectLocation?: Location, renderProps?: { routes?: PlainRoute[] }) => void,
) => void;

type Location = {
  pathname: string;
  action: 'PUSH' | 'REPLACE' | 'POP';
  key: string;
} & Record<string, any>;

type History = {
  location: Location;
  listen(cb: (location: Location) => void): void;
} & Record<string, any>;

/**
 * Creates routing instrumentation for React Router v3
 *
 * @param history object from the `history` library
 * @param routes a list of all routes, should be
 * @param match `Router.match` utility
 */
export function reactRouterV3Instrumenation(
  history: History,
  routes: PlainRoute[],
  match: Match,
): routingInstrumentation {
  return (
    startTransaction: (context: TransactionContext) => Transaction | undefined,
    startTransactionOnPageLoad: boolean = true,
    startTransactionOnLocationChange: boolean = true,
  ) => {
    let activeTransaction: Transaction | undefined;
    let name = normalizeTransactionName(routes, history.location, match);
    if (startTransactionOnPageLoad) {
      activeTransaction = startTransaction({
        name,
        op: 'pageload',
        tags: {
          from: name,
          routingInstrumentation: 'react-router-v3',
        },
      });
    }

    if (startTransactionOnLocationChange) {
      history.listen(location => {
        if (location.action === 'PUSH') {
          if (activeTransaction) {
            activeTransaction.finish();
          }
          const tags = { from: name, routingInstrumentation: 'react-router-v3' };
          name = normalizeTransactionName(routes, history.location, match);
          activeTransaction = startTransaction({
            name,
            op: 'navigation',
            tags,
          });
        }
      });
    }
  };
}

export function normalizeTransactionName(appRoutes: PlainRoute[], location: Location, match: Match): string {
  const defaultName = location.pathname;
  match(
    {
      location,
      routes: appRoutes,
    },
    (error?: Error, _redirectLocation?: Location, renderProps?: { routes?: PlainRoute[] }) => {
      if (error || !renderProps) {
        return defaultName;
      }

      const routePath = getRouteStringFromRoutes(renderProps.routes || []);

      if (routePath.length === 0 || routePath === '/*') {
        return defaultName;
      }

      return routePath;
    },
  );

  return defaultName;
}

function getRouteStringFromRoutes(routes: PlainRoute[]): string {
  if (!Array.isArray(routes)) {
    return '';
  }

  const routesWithPaths: PlainRoute[] = routes.filter((route: PlainRoute) => !!route.path);

  let index = -1;
  for (let x = routesWithPaths.length; x >= 0; x--) {
    if (routesWithPaths[x].path.startsWith('/')) {
      index = x;
      break;
    }
  }

  return routesWithPaths
    .slice(index)
    .filter(({ path }) => !!path)
    .map(({ path }) => path)
    .join('');
}
