import type {
  BeforeLeaveEventArgs,
  HashRouter,
  MemoryRouter,
  Router as BaseRouter,
  RouteSectionProps,
  StaticRouter,
} from '@solidjs/router';
import { useBeforeLeave, useCurrentMatches, useLocation } from '@solidjs/router';
import type { Component, JSX, ParentProps } from 'solid-js';
import { createEffect, mergeProps, splitProps } from 'solid-js';
import { createComponent } from 'solid-js/web';
import { createRouterSpanUpdater } from './solidrouter-shared';

export { solidRouterBrowserTracingIntegration } from './solidrouter-shared';

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
    const spanUpdater = createRouterSpanUpdater();

    useBeforeLeave(({ to }: BeforeLeaveEventArgs) => {
      spanUpdater.onBeforeLeave(to);
    });

    const location = useLocation();
    const matches = useCurrentMatches();

    createEffect(() => {
      spanUpdater.onRouteChange(
        { pathname: location.pathname, search: location.search, hash: location.hash },
        matches(),
      );
    });

    return createComponent(Root, props);
  };

  return SentryRouterRoot;
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
