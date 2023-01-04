/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Hub } from '@sentry/browser';
import { getCurrentHub } from '@sentry/browser';
import type { Span, Transaction } from '@sentry/types';
import { timestampWithMs } from '@sentry/utils';
import hoistNonReactStatics from 'hoist-non-react-statics';
import * as React from 'react';

import { REACT_MOUNT_OP, REACT_RENDER_OP, REACT_UPDATE_OP } from './constants';

export const UNKNOWN_COMPONENT = 'unknown';

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
  /**
   * The span that represents the duration of time between shouldComponentUpdate and componentDidUpdate
   */
  protected _updateSpan: Span | undefined = undefined;

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

    const activeTransaction = getActiveTransaction();
    if (activeTransaction) {
      this._mountSpan = activeTransaction.startChild({
        description: `<${name}>`,
        op: REACT_MOUNT_OP,
      });
    }
  }

  // If a component mounted, we can finish the mount activity.
  public componentDidMount(): void {
    if (this._mountSpan) {
      this._mountSpan.finish();
    }
  }

  public shouldComponentUpdate({ updateProps, includeUpdates = true }: ProfilerProps): boolean {
    // Only generate an update span if includeUpdates is true, if there is a valid mountSpan,
    // and if the updateProps have changed. It is ok to not do a deep equality check here as it is expensive.
    // We are just trying to give baseline clues for further investigation.
    if (includeUpdates && this._mountSpan && updateProps !== this.props.updateProps) {
      // See what props haved changed between the previous props, and the current props. This is
      // set as data on the span. We just store the prop keys as the values could be potenially very large.
      const changedProps = Object.keys(updateProps).filter(k => updateProps[k] !== this.props.updateProps[k]);
      if (changedProps.length > 0) {
        const now = timestampWithMs();
        this._updateSpan = this._mountSpan.startChild({
          data: {
            changedProps,
          },
          description: `<${this.props.name}>`,
          op: REACT_UPDATE_OP,
          startTimestamp: now,
        });
      }
    }

    return true;
  }

  public componentDidUpdate(): void {
    if (this._updateSpan) {
      this._updateSpan.finish();
      this._updateSpan = undefined;
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
    // eslint-disable-next-line react/prop-types
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
