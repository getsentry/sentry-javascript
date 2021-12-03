/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { getCurrentHub, Hub } from '@sentry/browser';
import { Integration, IntegrationClass, Span, Transaction } from '@sentry/types';
import { timestampWithMs } from '@sentry/utils';
import hoistNonReactStatics from 'hoist-non-react-statics';
import * as React from 'react';

import { REACT_MOUNT_OP, REACT_RENDER_OP, REACT_UPDATE_OP } from './constants';

export const UNKNOWN_COMPONENT = 'unknown';

const TRACING_GETTER = ({
  id: 'Tracing',
} as any) as IntegrationClass<Integration>;

let globalTracingIntegration: Integration | null = null;
/** @deprecated remove when @sentry/apm no longer used */
const getTracingIntegration = (): Integration | null => {
  if (globalTracingIntegration) {
    return globalTracingIntegration;
  }

  globalTracingIntegration = getCurrentHub().getIntegration(TRACING_GETTER);
  return globalTracingIntegration;
};

/**
 * pushActivity creates an new react activity.
 * Is a no-op if Tracing integration is not valid
 * @param name displayName of component that started activity
 * @deprecated remove when @sentry/apm no longer used
 */
function pushActivity(name: string, op: string): number | null {
  if (globalTracingIntegration === null) {
    return null;
  }

  return (globalTracingIntegration as any).constructor.pushActivity(name, {
    description: `<${name}>`,
    op,
  });
}

/**
 * popActivity removes a React activity.
 * Is a no-op if Tracing integration is not valid.
 * @param activity id of activity that is being popped
 * @deprecated remove when @sentry/apm no longer used
 */
function popActivity(activity: number | null): void {
  if (activity === null || globalTracingIntegration === null) {
    return;
  }

  (globalTracingIntegration as any).constructor.popActivity(activity);
}

/**
 * Obtain a span given an activity id.
 * Is a no-op if Tracing integration is not valid.
 * @param activity activity id associated with obtained span
 * @deprecated remove when @sentry/apm no longer used
 */
function getActivitySpan(activity: number | null): Span | undefined {
  if (activity === null || globalTracingIntegration === null) {
    return undefined;
  }

  return (globalTracingIntegration as any).constructor.getActivitySpan(activity) as Span | undefined;
}

export type ProfilerProps = {
  // The name of the component being profiled.
  name: string;
  // If the Profiler is disabled. False by default. This is useful if you want to disable profilers
  // in certain environments.
  disabled?: boolean;
  // If time component is on page should be displayed as spans. True by default.
  includeRender?: boolean;
  // If component updates should be displayed as spans. True by default.
  includeUpdates?: boolean;
  // props given to component being profiled.
  updateProps: { [key: string]: unknown };
};

/**
 * The Profiler component leverages Sentry's Tracing integration to generate
 * spans based on component lifecycles.
 */
class Profiler extends React.Component<ProfilerProps> {
  /**
   * The span of the mount activity
   * Made protected for the React Native SDK to access
   */
  protected _mountSpan: Span | undefined = undefined;

  // The activity representing how long it takes to mount a component.
  private _mountActivity: number | null = null;

  // eslint-disable-next-line @typescript-eslint/member-ordering
  public static defaultProps: Partial<ProfilerProps> = {
    disabled: false,
    includeRender: true,
    includeUpdates: true,
  };

  public constructor(props: ProfilerProps) {
    super(props);
    const { name, disabled = false } = this.props;

    if (disabled) {
      return;
    }

    // If they are using @sentry/apm, we need to push/pop activities
    // eslint-disable-next-line deprecation/deprecation
    if (getTracingIntegration()) {
      // eslint-disable-next-line deprecation/deprecation
      this._mountActivity = pushActivity(name, REACT_MOUNT_OP);
    } else {
      const activeTransaction = getActiveTransaction();
      if (activeTransaction) {
        this._mountSpan = activeTransaction.startChild({
          description: `<${name}>`,
          op: REACT_MOUNT_OP,
        });
      }
    }
  }

  // If a component mounted, we can finish the mount activity.
  public componentDidMount(): void {
    if (this._mountSpan) {
      this._mountSpan.finish();
    } else {
      // eslint-disable-next-line deprecation/deprecation
      this._mountSpan = getActivitySpan(this._mountActivity);
      // eslint-disable-next-line deprecation/deprecation
      popActivity(this._mountActivity);
      this._mountActivity = null;
    }
  }

  public componentDidUpdate({ updateProps, includeUpdates = true }: ProfilerProps): void {
    // Only generate an update span if hasUpdateSpan is true, if there is a valid mountSpan,
    // and if the updateProps have changed. It is ok to not do a deep equality check here as it is expensive.
    // We are just trying to give baseline clues for further investigation.
    if (includeUpdates && this._mountSpan && updateProps !== this.props.updateProps) {
      // See what props haved changed between the previous props, and the current props. This is
      // set as data on the span. We just store the prop keys as the values could be potenially very large.
      const changedProps = Object.keys(updateProps).filter(k => updateProps[k] !== this.props.updateProps[k]);
      if (changedProps.length > 0) {
        // The update span is a point in time span with 0 duration, just signifying that the component
        // has been updated.
        const now = timestampWithMs();
        this._mountSpan.startChild({
          data: {
            changedProps,
          },
          description: `<${this.props.name}>`,
          endTimestamp: now,
          op: REACT_UPDATE_OP,
          startTimestamp: now,
        });
      }
    }
  }

  // If a component is unmounted, we can say it is no longer on the screen.
  // This means we can finish the span representing the component render.
  public componentWillUnmount(): void {
    const { name, includeRender = true } = this.props;

    if (this._mountSpan && includeRender) {
      // If we were able to obtain the spanId of the mount activity, we should set the
      // next activity as a child to the component mount activity.
      this._mountSpan.startChild({
        description: `<${name}>`,
        endTimestamp: timestampWithMs(),
        op: REACT_RENDER_OP,
        startTimestamp: this._mountSpan.endTimestamp,
      });
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
function withProfiler<P extends Record<string, any>>(
  WrappedComponent: React.ComponentType<P>,
  // We do not want to have `updateProps` given in options, it is instead filled through the HOC.
  options?: Pick<Partial<ProfilerProps>, Exclude<keyof ProfilerProps, 'updateProps'>>,
): React.FC<P> {
  const componentDisplayName =
    (options && options.name) || WrappedComponent.displayName || WrappedComponent.name || UNKNOWN_COMPONENT;

  const Wrapped: React.FC<P> = (props: P) => (
    <Profiler {...options} name={componentDisplayName} updateProps={props}>
      <WrappedComponent {...props} />
    </Profiler>
  );

  Wrapped.displayName = `profiler(${componentDisplayName})`;

  // Copy over static methods from Wrapped component to Profiler HOC
  // See: https://reactjs.org/docs/higher-order-components.html#static-methods-must-be-copied-over
  hoistNonReactStatics(Wrapped, WrappedComponent);
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
  options: { disabled?: boolean; hasRenderSpan?: boolean } = {
    disabled: false,
    hasRenderSpan: true,
  },
): void {
  const [mountSpan] = React.useState(() => {
    if (options && options.disabled) {
      return undefined;
    }

    const activeTransaction = getActiveTransaction();
    if (activeTransaction) {
      return activeTransaction.startChild({
        description: `<${name}>`,
        op: REACT_MOUNT_OP,
      });
    }

    return undefined;
  });

  React.useEffect(() => {
    if (mountSpan) {
      mountSpan.finish();
    }

    return (): void => {
      if (mountSpan && options.hasRenderSpan) {
        mountSpan.startChild({
          description: `<${name}>`,
          endTimestamp: timestampWithMs(),
          op: REACT_RENDER_OP,
          startTimestamp: mountSpan.endTimestamp,
        });
      }
    };
    // We only want this to run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export { withProfiler, Profiler, useProfiler };

/** Grabs active transaction off scope */
export function getActiveTransaction<T extends Transaction>(hub: Hub = getCurrentHub()): T | undefined {
  if (hub) {
    const scope = hub.getScope();
    if (scope) {
      return scope.getTransaction() as T | undefined;
    }
  }

  return undefined;
}
