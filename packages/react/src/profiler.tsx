import { getCurrentHub } from '@sentry/browser';
import { Integration, IntegrationClass, Span } from '@sentry/types';
import { logger, timestampWithMs } from '@sentry/utils';
import * as hoistNonReactStatic from 'hoist-non-react-statics';
import * as React from 'react';

export const UNKNOWN_COMPONENT = 'unknown';

const TRACING_GETTER = ({
  id: 'Tracing',
} as any) as IntegrationClass<Integration>;

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

/**
 * Obtain a span given an activity id.
 * Is a no-op if invalid Tracing integration.
 * @param activity activity id associated with obtained span
 */
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
  // If the Profiler is disabled. False by default. This is useful if you want to disable profilers
  // in certain environments.
  disabled?: boolean;
  // If time component is on page should be displayed as spans. False by default.
  hasRenderSpan?: boolean;
  // If component updates should be displayed as spans. True by default.
  hasUpdateSpan?: boolean;
  // props given to component being profiled.
  updateProps: { [key: string]: any };
};

/**
 * The Profiler component leverages Sentry's Tracing integration to generate
 * spans based on component lifecycles.
 */
class Profiler extends React.Component<ProfilerProps> {
  // The activity representing how long it takes to mount a component.
  public mountActivity: number | null = null;
  // The span of the mount activity
  public mountSpan: Span | undefined = undefined;
  // The span of the render
  public renderSpan: Span | undefined = undefined;

  public static defaultProps: Partial<ProfilerProps> = {
    disabled: false,
    hasRenderSpan: false,
    hasUpdateSpan: true,
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
    this.mountSpan = getActivitySpan(this.mountActivity);
    popActivity(this.mountActivity);
    this.mountActivity = null;

    const { name, hasRenderSpan = false } = this.props;

    // If we were able to obtain the spanId of the mount activity, we should set the
    // next activity as a child to the component mount activity.
    if (this.mountSpan && hasRenderSpan) {
      this.renderSpan = this.mountSpan.startChild({
        description: `<${name}>`,
        op: `react.render`,
      });
    }
  }

  public componentDidUpdate({ updateProps, hasUpdateSpan = true }: ProfilerProps): void {
    // Only generate an update span if hasUpdateSpan is true, if there is a valid mountSpan,
    // and if the updateProps have changed. It is ok to not do a deep equality check here as it is expensive.
    // We are just trying to give baseline clues for further investigation.
    if (hasUpdateSpan && this.mountSpan && updateProps !== this.props.updateProps) {
      // See what props haved changed between the previous props, and the current props. This is
      // set as data on the span. We just store the prop keys as the values could be potenially very large.
      const changedProps = Object.keys(updateProps).filter(k => updateProps[k] !== this.props.updateProps[k]);
      if (changedProps.length > 0) {
        // The update span is a point in time span with 0 duration, just signifying that the component
        // has been updated.
        const now = timestampWithMs();
        this.mountSpan.startChild({
          data: {
            changedProps,
          },
          description: `<${this.props.name}>`,
          endTimestamp: now,
          op: `react.update`,
          startTimestamp: now,
        });
      }
    }
  }

  // If a component is unmounted, we can say it is no longer on the screen.
  // This means we can finish the span representing the component render.
  public componentWillUnmount(): void {
    if (this.renderSpan) {
      this.renderSpan.finish();
    }
  }

  public render(): React.ReactNode {
    return this.props.children;
  }
}

/**
 * withProfiler is a higher order component that wraps a
 * component in a {@link Profiler} component. It is recommended that
 * the higher order component be used over the regular {@link Profiler} component.
 *
 * @param WrappedComponent component that is wrapped by Profiler
 * @param options the {@link ProfilerProps} you can pass into the Profiler
 */
function withProfiler<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  // We do not want to have `updateProps` given in options, it is instead filled through
  // the HOC.
  options?: Pick<Partial<ProfilerProps>, Exclude<keyof ProfilerProps, 'updateProps'>>,
): React.FC<P> {
  const componentDisplayName =
    (options && options.name) || WrappedComponent.displayName || WrappedComponent.name || UNKNOWN_COMPONENT;

  const Wrapped: React.FC<P> = (props: P) => (
    <Profiler name={componentDisplayName} disabled={options && options.disabled} updateProps={props}>
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
function useProfiler(
  name: string,
  options?: {
    disabled?: boolean;
    hasRenderSpan?: boolean;
  },
): void {
  const [mountActivity] = React.useState(() => {
    if (options && options.disabled) {
      return null;
    }

    if (getTracingIntegration()) {
      return pushActivity(name, 'mount');
    }

    warnAboutTracing(name);
    return null;
  });

  React.useEffect(() => {
    const mountSpan = getActivitySpan(mountActivity);
    popActivity(mountActivity);

    const renderSpan =
      mountSpan && options && options.hasRenderSpan
        ? mountSpan.startChild({
            description: `<${name}>`,
            op: `react.render`,
          })
        : undefined;

    return () => {
      if (renderSpan) {
        renderSpan.finish();
      }
    };
  }, []);
}

export { withProfiler, Profiler, useProfiler };
