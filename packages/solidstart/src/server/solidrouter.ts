import type { HashRouter, MemoryRouter, RouteSectionProps, StaticRouter } from '@solidjs/router';
// import { useBeforeLeave, useLocation } from '@solidjs/router';
import type { Router as BaseRouter } from '@solidjs/router/dist/routers/Router';
import type { Component, JSX, ParentProps } from 'solid-js';
import { createComponent, mergeProps, splitProps } from 'solid-js';

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

    // useBeforeLeave(({ to }: BeforeLeaveEventArgs) => {
    //   `to` could be `-1` if the browser back-button was used
    //   eslint-disable-next-line no-console
    //   console.log('[server] useBeforeLeave', to.toString());
    // });

    // const location = useLocation();
    // createEffect(() => {
      // eslint-disable-next-line no-console
      // console.log('[server] useLocation', location.pathname);
    // });

    return createComponent(Root, props);
  };

  return SentryRouterRoot;
}

/**
 *
 */
export function solidRouterBrowserTracingIntegration(): void {}

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
