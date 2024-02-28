import { startInactiveSpan } from '@sentry/browser';
import { SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN, spanToJSON, withActiveSpan } from '@sentry/core';
import type { Span } from '@sentry/types';
import { timestampInSeconds } from '@sentry/utils';
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
  // Component that is being profiled.
  children?: React.ReactNode;
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
  protected _mountSpan: Span | undefined;
  /**
   * The span that represents the duration of time between shouldComponentUpdate and componentDidUpdate
   */
  protected _updateSpan: Span | undefined;

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

    this._mountSpan = startInactiveSpan({
      name: `<${name}>`,
      onlyIfParent: true,
      op: REACT_MOUNT_OP,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.react.profiler',
        'ui.component_name': name,
      },
    });
  }

  // If a component mounted, we can finish the mount activity.
  public componentDidMount(): void {
    if (this._mountSpan) {
      this._mountSpan.end();
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
        const now = timestampInSeconds();
        this._updateSpan = withActiveSpan(this._mountSpan, () => {
          return startInactiveSpan({
            name: `<${this.props.name}>`,
            onlyIfParent: true,
            op: REACT_UPDATE_OP,
            startTime: now,
            attributes: {
              [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.react.profiler',
              'ui.component_name': this.props.name,
              'ui.react.changed_props': changedProps,
            },
          });
        });
      }
    }

    return true;
  }

  public componentDidUpdate(): void {
    if (this._updateSpan) {
      this._updateSpan.end();
      this._updateSpan = undefined;
    }
  }

  // If a component is unmounted, we can say it is no longer on the screen.
  // This means we can finish the span representing the component render.
  public componentWillUnmount(): void {
    const endTimestamp = timestampInSeconds();
    const { name, includeRender = true } = this.props;

    if (this._mountSpan && includeRender) {
      const startTime = spanToJSON(this._mountSpan).timestamp;
      withActiveSpan(this._mountSpan, () => {
        const renderSpan = startInactiveSpan({
          onlyIfParent: true,
          name: `<${name}>`,
          op: REACT_RENDER_OP,
          startTime,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.react.profiler',
            'ui.component_name': name,
          },
        });
        if (renderSpan) {
          // Have to cast to Span because the type of _mountSpan is Span | undefined
          // and not getting narrowed properly
          renderSpan.end(endTimestamp);
        }
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withProfiler<P extends Record<string, any>>(
  WrappedComponent: React.ComponentType<P>,
  // We do not want to have `updateProps` given in options, it is instead filled through the HOC.
  options?: Pick<Partial<ProfilerProps>, Exclude<keyof ProfilerProps, 'updateProps' | 'children'>>,
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

    return startInactiveSpan({
      name: `<${name}>`,
      onlyIfParent: true,
      op: REACT_MOUNT_OP,
      attributes: {
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.react.profiler',
        'ui.component_name': name,
      },
    });
  });

  React.useEffect(() => {
    if (mountSpan) {
      mountSpan.end();
    }

    return (): void => {
      if (mountSpan && options.hasRenderSpan) {
        const startTime = spanToJSON(mountSpan).timestamp;
        const endTimestamp = timestampInSeconds();

        const renderSpan = startInactiveSpan({
          name: `<${name}>`,
          onlyIfParent: true,
          op: REACT_RENDER_OP,
          startTime,
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.ui.react.profiler',
            'ui.component_name': name,
          },
        });
        if (renderSpan) {
          // Have to cast to Span because the type of _mountSpan is Span | undefined
          // and not getting narrowed properly
          renderSpan.end(endTimestamp);
        }
      }
    };
    // We only want this to run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export { withProfiler, Profiler, useProfiler };
