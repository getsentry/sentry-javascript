import {
  browserTracingIntegration,
  getActiveSpan,
  getRootSpan,
  spanToJSON,
  startBrowserTracingNavigationSpan,
} from '@sentry/browser';
import {
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  getClient,
} from '@sentry/core';
import type { Client, Integration, Span } from '@sentry/types';
import { logger } from '@sentry/utils';
import { createEffect, mergeProps, splitProps } from 'solid-js';
import type { Component, JSX, ParentProps } from 'solid-js';
import { createComponent } from 'solid-js/web';
import { DEBUG_BUILD } from './debug-build';

// Vendored solid router types so that we don't need to depend on solid router.
// These are not exhaustive and loose on purpose.
interface Location {
  pathname: string;
}

interface BeforeLeaveEventArgs {
  from: Location;
  to: string | number;
}

interface RouteSectionProps<T = unknown> {
  location: Location;
  data?: T;
  children?: JSX.Element;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RouteDefinition<S extends string | string[] = any, T = unknown> = {
  path?: S;
  children?: RouteDefinition | RouteDefinition[];
  component?: Component<RouteSectionProps<T>>;
};

interface RouterProps {
  base?: string;
  root?: Component<RouteSectionProps>;
  children?: JSX.Element | RouteDefinition | RouteDefinition[];
}

interface SolidRouterOptions {
  useBeforeLeave: UserBeforeLeave;
  useLocation: UseLocation;
}

type UserBeforeLeave = (listener: (e: BeforeLeaveEventArgs) => void) => void;
type UseLocation = () => Location;

const CLIENTS_WITH_INSTRUMENT_NAVIGATION = new WeakSet<Client>();

let _useBeforeLeave: UserBeforeLeave;
let _useLocation: UseLocation;

function handleNavigation(location: string): void {
  const client = getClient();
  if (!client || !CLIENTS_WITH_INSTRUMENT_NAVIGATION.has(client)) {
    return;
  }

  startBrowserTracingNavigationSpan(client, {
    name: location,
    attributes: {
      [SEMANTIC_ATTRIBUTE_SENTRY_OP]: 'navigation',
      [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.navigation.solid.solidrouter',
      [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'url',
    },
  });
}

function getActiveRootSpan(): Span | undefined {
  const span = getActiveSpan();
  return span ? getRootSpan(span) : undefined;
}

/** Pass-through component in case user didn't specify a root **/
function SentryDefaultRoot(props: ParentProps): JSX.Element {
  return props.children;
}

/**
 * Unfortunately, we cannot use router hooks directly in the Router, so we
 * need to wrap the `root` prop to instrument navigation.
 */
function withSentryRouterRoot(Root: Component<RouteSectionProps>): Component<RouteSectionProps> {
  const SentryRouterRoot = (props: RouteSectionProps): JSX.Element => {
    // TODO: This is a rudimentary first version of handling navigation spans
    // It does not
    // - use query params
    // - parameterize the route

    _useBeforeLeave(({ to }: BeforeLeaveEventArgs) => {
      // `to` could be `-1` if the browser back-button was used
      handleNavigation(to.toString());
    });

    const location = _useLocation();
    createEffect(() => {
      const name = location.pathname;
      const rootSpan = getActiveRootSpan();

      if (rootSpan) {
        const { op, description } = spanToJSON(rootSpan);

        // We only need to update navigation spans that have been created by
        // a browser back-button navigation (stored as `-1` by solid router)
        // everything else was already instrumented correctly in `useBeforeLeave`
        if (op === 'navigation' && description === '-1') {
          rootSpan.updateName(name);
        }
      }
    });

    return createComponent(Root, props);
  };

  return SentryRouterRoot;
}

/**
 * A browser tracing integration that uses Solid Router to instrument navigations.
 */
export function solidRouterBrowserTracingIntegration(
  options: Parameters<typeof browserTracingIntegration>[0] & SolidRouterOptions,
): Integration {
  const integration = browserTracingIntegration({
    ...options,
    instrumentNavigation: false,
  });

  const { instrumentNavigation = true, useBeforeLeave, useLocation } = options;

  return {
    ...integration,
    setup() {
      _useBeforeLeave = useBeforeLeave;
      _useLocation = useLocation;
    },
    afterAllSetup(client) {
      integration.afterAllSetup(client);

      if (instrumentNavigation) {
        CLIENTS_WITH_INSTRUMENT_NAVIGATION.add(client);
      }
    },
  };
}

/**
 * A higher-order component to instrument Solid Router to create navigation spans.
 */
export function withSentryRouterRouting(Router: Component<RouterProps>): Component<RouterProps> {
  if (!_useBeforeLeave || !_useLocation) {
    DEBUG_BUILD &&
      logger.warn(`solidRouterBrowserTracingIntegration was unable to wrap Solid Router because of one or more missing hooks.
      useBeforeLeave: ${_useBeforeLeave}. useLocation: ${_useLocation}.`);

    return Router;
  }

  const SentryRouter = (props: RouterProps): JSX.Element => {
    const [local, others] = splitProps(props, ['root']);
    // We need to wrap root here in case the user passed in their own root
    const Root = withSentryRouterRoot(local.root ? local.root : SentryDefaultRoot);

    return createComponent(Router, mergeProps({ root: Root }, others));
  };

  return SentryRouter;
}
