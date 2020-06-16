import { getCurrentHub } from '@sentry/browser';
import { Integration, IntegrationClass, Span } from '@sentry/types';
import { logger } from '@sentry/utils';
import * as hoistNonReactStatic from 'hoist-non-react-statics';
import * as React from 'react';

export const UNKNOWN_COMPONENT = 'unknown';

const TRACING_GETTER = ({
  id: 'Tracing',
} as any) as IntegrationClass<Integration>;

/**
 *
 * Based on implementation from Preact:
 * https:github.com/preactjs/preact/blob/9a422017fec6dab287c77c3aef63c7b2fef0c7e1/hooks/src/index.js#L301-L313
 *
 * Schedule a callback to be invoked after the browser has a chance to paint a new frame.
 * Do this by combining requestAnimationFrame (rAF) + setTimeout to invoke a callback after
 * the next browser frame.
 *
 * Also, schedule a timeout in parallel to the the rAF to ensure the callback is invoked
 * even if RAF doesn't fire (for example if the browser tab is not visible)
 *
 * This is what we use to tell if a component activity has finished
 *
 */
function afterNextFrame(callback: Function): void {
  let timeout: number | undefined;
  let raf: number;

  const done = () => {
    window.clearTimeout(timeout);
    window.cancelAnimationFrame(raf);
    window.setTimeout(callback);
  };

  raf = window.requestAnimationFrame(done);
  timeout = window.setTimeout(done, 100);
}

let globalTracingIntegration: Integration | null = null;
const getTracingIntegration = () => {
  if (globalTracingIntegration) {
    return globalTracingIntegration;
  }

  globalTracingIntegration = getCurrentHub().getIntegration(TRACING_GETTER);
  return globalTracingIntegration;
};

/** JSDOC */
function warnAboutTracing(name: string): void {
  if (globalTracingIntegration === null) {
    logger.warn(
      `Unable to profile component ${name} due to invalid Tracing Integration. Please make sure to setup the Tracing integration.`,
    );
  }
}

/**
 * pushActivity creates an new react activity
 * @param name displayName of component that started activity
 */
const pushActivity = (name: string): number | null => {
  if (globalTracingIntegration === null) {
    return null;
  }

  // tslint:disable-next-line:no-unsafe-any
  return (globalTracingIntegration as any).constructor.pushActivity(name, {
    description: `<${name}>`,
    op: 'react',
  });
};

/**
 * popActivity removes a React activity if it exists
 * @param activity id of activity that is being popped
 */
const popActivity = (activity: number | null): void => {
  if (activity === null || globalTracingIntegration === null) {
    return;
  }

  // tslint:disable-next-line:no-unsafe-any
  (globalTracingIntegration as any).constructor.popActivity(activity);
};

export type ProfilerProps = {
  // The name of the component being profiled.
  name: string;
  // If the Profiler is disabled. False by default.
  disabled?: boolean;
};

/**
 * The Profiler component leverages Sentry's Tracing integration to generate
 * spans based on component lifecycles.
 */
class Profiler extends React.Component<ProfilerProps> {
  public activity: number | null = null;
  // The activity representing when a component was mounted onto a page.
  public mountInfo: {
    activity: number | null;
    span: Span | null;
  } = {
    activity: null,
    span: null,
  };
  // The activity representing how long a component was on the page.
  public visibleActivity: number | null = null;

  public constructor(props: ProfilerProps) {
    super(props);
    const { name, disabled = false } = this.props;

    if (disabled) {
      return;
    }

    if (getTracingIntegration()) {
      this.activity = pushActivity(name);
    } else {
      warnAboutTracing(name);
    }
  }

  // If a component mounted, we can finish the mount activity.
  public componentDidMount(): void {
    afterNextFrame(this.finishProfile);
  }

  // Sometimes a component will unmount first, so we make
  // sure to also finish the mount activity here.
  public componentWillUnmount(): void {
    afterNextFrame(this.finishProfile);
  }

  public finishProfile = () => {
    afterNextFrame(() => {
      popActivity(this.activity);
      this.activity = null;
    });
  };

  public render(): React.ReactNode {
    return this.props.children;
  }
}

/**
 * withProfiler is a higher order component that wraps a
 * component in a {@link Profiler} component.
 *
 * @param WrappedComponent component that is wrapped by Profiler
 * @param options the {@link ProfilerProps} you can pass into the Profiler
 */
function withProfiler<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options?: Partial<ProfilerProps>,
): React.FC<P> {
  const componentDisplayName =
    (options && options.name) || WrappedComponent.displayName || WrappedComponent.name || UNKNOWN_COMPONENT;

  const Wrapped: React.FC<P> = (props: P) => (
    <Profiler name={componentDisplayName} disabled={options && options.disabled}>
      <WrappedComponent {...props} />
    </Profiler>
  );

  Wrapped.displayName = `profiler(${componentDisplayName})`;

  // Copy over static methods from Wrapped component to Profiler HOC
  // See: https://reactjs.org/docs/higher-order-components.html#static-methods-must-be-copied-over
  hoistNonReactStatic(Wrapped, WrappedComponent);
  return Wrapped;
}

/**
 *
 * `useProfiler` is a React hook that profiles a React component.
 *
 * Requires React 16.8 or above.
 * @param name displayName of component being profiled
 */
function useProfiler(name: string): void {
  const [activity] = React.useState(() => pushActivity(name));

  React.useEffect(() => {
    afterNextFrame(() => {
      const tracingIntegration = getCurrentHub().getIntegration(TRACING_GETTER);
      if (tracingIntegration !== null) {
        // tslint:disable-next-line:no-unsafe-any
        (tracingIntegration as any).constructor.popActivity(activity);
      }
    });
  }, []);
}

export { withProfiler, Profiler, useProfiler };
