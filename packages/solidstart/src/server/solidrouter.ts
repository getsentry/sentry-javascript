import type { Integration } from '@sentry/types';
import type { HashRouter, MemoryRouter, RouteSectionProps, Router as BaseRouter, StaticRouter } from '@solidjs/router';
import { mergeProps, splitProps } from 'solid-js';
import type { Component, JSX, ParentProps } from 'solid-js';
import { createComponent } from 'solid-js/web';

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
    return createComponent(Root, props);
  };

  return SentryRouterRoot;
}

/**
 * A browser tracing integration that uses Solid Router to instrument navigations.
 */
export function solidRouterBrowserTracingIntegration(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  options: any,
): Integration {
  return {
    name: 'solidRouterBrowserTracingIntegration',
  };
}

type RouterType = typeof BaseRouter | typeof HashRouter | typeof MemoryRouter | typeof StaticRouter;

/**
 * A higher-order component to instrument Solid Router to create navigation spans.
 */
export function withSentryRouterRouting(Router: RouterType): RouterType {
  const SentryRouter = (props: Parameters<RouterType>[0]): JSX.Element => {
    const [local, others] = splitProps(props, ['root']);
    // We need to wrap root here in case the user passed in their own root
    const Root = withSentryRouterRoot(local.root ? local.root : SentryDefaultRoot);

    return createComponent(Router, mergeProps({ root: Root }, others));
  };

  return SentryRouter;
}
