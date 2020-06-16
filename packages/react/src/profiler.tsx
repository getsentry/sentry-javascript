import { getCurrentHub } from '@sentry/browser';
import { Integration, IntegrationClass, Span } from '@sentry/types';
import { logger, timestampWithMs } from '@sentry/utils';
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

/**
 * Warn if tracing integration not configured. Will only warn once.
 */
function warnAboutTracing(name: string): void {
  if (globalTracingIntegration === null) {
    logger.warn(
      `Unable to profile component ${name} due to invalid Tracing Integration. Please make sure the Tracing integration is setup properly.`,
    );
  }
}

/**
 * pushActivity creates an new react activity.
 * Is a no-op if Tracing integration is not valid
 * @param name displayName of component that started activity
 */
function pushActivity(
  name: string,
  op: string,
  options?: {
    autoPopAfter?: number;
    parentSpanId?: string;
  },
): number | null {
  if (globalTracingIntegration === null) {
    return null;
  }

  // tslint:disable-next-line:no-unsafe-any
  return (globalTracingIntegration as any).constructor.pushActivity(
    name,
    {
      description: `<${name}>`,
      op: `react.${op}`,
    },
    options,
  );
}

/**
 * popActivity removes a React activity.
 * Is a no-op if invalid Tracing integration or invalid activity id.
 * @param activity id of activity that is being popped
 * @param finish if a span should be finished after the activity is removed
 */
function popActivity(activity: number | null): void {
  if (activity === null || globalTracingIntegration === null) {
    return;
  }

  // tslint:disable-next-line:no-unsafe-any
  (globalTracingIntegration as any).constructor.popActivity(activity, undefined);
}

function getActivitySpan(activity: number | null): Span | undefined {
  if (globalTracingIntegration === null) {
    return undefined;
  }

  // tslint:disable-next-line:no-unsafe-any
  return (globalTracingIntegration as any).constructor.getActivitySpan(activity) as Span | undefined;
}

export type ProfilerProps = {
  // The name of the component being profiled.
  name: string;
  // If the Profiler is disabled. False by default.
  disabled?: boolean;
  // If component updates should be displayed as spans. False by default.
  generateUpdateSpans?: boolean;
};

/**
 * The Profiler component leverages Sentry's Tracing integration to generate
 * spans based on component lifecycles.
 */
class Profiler extends React.Component<ProfilerProps> {
  // The activity representing how long it takes to mount a component.
  public mountActivity: number | null = null;
  // The span of the mount activity
  public span: Span | undefined = undefined;
  // The activity representing how long a component was on the page.
  public renderActivity: number | null = null;
  public renderSpan: Span | undefined = undefined;

  public static defaultProps: Partial<ProfilerProps> = {
    disabled: false,
    generateUpdateSpans: true,
  };

  public constructor(props: ProfilerProps) {
    super(props);
    const { name, disabled = false } = this.props;

    if (disabled) {
      return;
    }

    if (getTracingIntegration()) {
      this.mountActivity = pushActivity(name, 'mount');
    } else {
      warnAboutTracing(name);
    }
  }

  // If a component mounted, we can finish the mount activity.
  public componentDidMount(): void {
    // afterNextFrame(() => {
    this.span = getActivitySpan(this.mountActivity);
    popActivity(this.mountActivity);
    this.mountActivity = null;

    // If we were able to obtain the spanId of the mount activity, we should set the
    // next activity as a child to the component mount activity.
    if (this.span) {
      this.renderSpan = this.span.startChild({
        description: `<${this.props.name}>`,
        op: `react.render`,
      });
    }
    // });
  }

  public componentDidUpdate(prevProps: ProfilerProps): void {
    if (prevProps.generateUpdateSpans && this.span && prevProps !== this.props) {
      const now = timestampWithMs();
      this.span.startChild({
        description: `<${prevProps.name}>`,
        endTimestamp: now,
        op: `react.update`,
        startTimestamp: now,
      });
    }
  }

  // If a component doesn't mount, the render activity will be end when the
  public componentWillUnmount(): void {
    afterNextFrame(() => {
      if (this.renderSpan) {
        this.renderSpan.finish();
      }
      // popActivity(this.renderActivity);
      // this.renderActivity = null;
    });
  }

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
  const [activity] = React.useState(() => pushActivity(name, 'mount'));

  React.useEffect(() => {
    afterNextFrame(() => {
      popActivity(activity);
      const renderActivity = pushActivity(name, 'render');

      return () => {
        popActivity(renderActivity);
      };
    });
  }, []);
}

export { withProfiler, Profiler, useProfiler };
