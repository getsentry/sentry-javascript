import { getCurrentHub } from '@sentry/browser';
import { Integration, IntegrationClass, SpanContext, Transaction } from '@sentry/types';
import { parseSemver, logger, SemVer } from '@sentry/utils';
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

/**
 * isProfilingModeOn tells us if the React.Profiler will correctly
 * Profile it's components. This is only active in development mode
 * and in profiling mode.
 *
 * Learn how to do that here: https://gist.github.com/bvaughn/25e6233aeb1b4f0cdb8d8366e54a3977
 */
function isProfilingModeOn(): boolean {
  const fake = React.createElement('div') as any;

  // tslint:disable-next-line: triple-equals no-unsafe-any
  if (fake._owner != null && fake._owner.actualDuration != null) {
    // if the component has a valid owner, and that owner has a duration
    // React is profiling all it's components
    return true;
  }

  return false;
}

const getInitActivity = (name: string): number | null => {
  const tracingIntegration = getCurrentHub().getIntegration(TRACING_GETTER);

  if (tracingIntegration !== null) {
    // tslint:disable-next-line:no-unsafe-any
    return (tracingIntegration as any).constructor.pushActivity(name, {
      description: `<${name}>`,
      op: 'react.mount',
    });
  }

  logger.warn(
    `Unable to profile component ${name} due to invalid Tracing Integration. Please make sure to setup the Tracing integration.`,
  );
  return null;
};

export type ProfilerProps = {
  name: string;
};

class Profiler extends React.Component<ProfilerProps> {
  public activity: number | null;
  public hasProfilingMode: boolean | null = null;
  public reactVersion: SemVer = parseSemver(React.version);

  public constructor(props: ProfilerProps) {
    super(props);

    this.activity = getInitActivity(this.props.name);
  }

  public componentDidMount(): void {
    if (!this.hasProfilingMode) {
      afterNextFrame(this.finishProfile);
    }
  }

  public componentWillUnmount(): void {
    afterNextFrame(this.finishProfile);
  }

  /**
   *
   * React calls handleProfilerRender() any time a component within the profiled
   * tree “commits” an update.
   *
   */
  public handleProfilerRender = (
    // The id prop of the Profiler tree that has just committed
    id: string,
    // Identifies whether the tree has just been mounted for the first time
    // or re-rendered due to a change in props, state, or hooks
    phase: 'mount' | 'update',
    // Time spent rendering the Profiler and its descendants for the current update
    actualDuration: number,
    // Duration of the most recent render time for each individual component within the Profiler tree
    _baseDuration: number,
    // Timestamp when React began rendering the current update
    // pageload = startTime of 0
    startTime: number,
    // Timestamp when React committed the current update
    commitTime: number,
  ) => {
    if (phase === 'mount') {
      afterNextFrame(this.finishProfile);
    }

    const componentName = this.props.name === UNKNOWN_COMPONENT ? id : this.props.name;

    const tracingIntegration = getCurrentHub().getIntegration(TRACING_GETTER);
    if (tracingIntegration !== null) {
      // tslint:disable-next-line: no-unsafe-any
      const activeTransaction = (tracingIntegration as any).constructor._activeTransaction as Transaction;
      console.table({ id, phase, actualDuration, _baseDuration, startTime, commitTime });
      console.log(activeTransaction);

      if (activeTransaction) {
        const spanContext: SpanContext = {
          description: `<${componentName}>`,
          op: 'react.update',
          startTimestamp: activeTransaction.startTimestamp + startTime,
        };

        const span = activeTransaction.startChild(spanContext);

        span.finish(activeTransaction.startTimestamp + actualDuration);
      }
    }
  };

  public finishProfile = () => {
    if (!this.activity) {
      return;
    }

    const tracingIntegration = getCurrentHub().getIntegration(TRACING_GETTER);
    if (tracingIntegration !== null) {
      // tslint:disable-next-line:no-unsafe-any
      (tracingIntegration as any).constructor.popActivity(this.activity);
      this.activity = null;
    }
  };

  public render(): React.ReactNode {
    const { name } = this.props;

    if (
      // React <= v16.4
      (this.reactVersion.major && this.reactVersion.major <= 15) ||
      (this.reactVersion.major === 16 && this.reactVersion.minor && this.reactVersion.minor <= 4)
    ) {
      return this.props.children;
    }

    if (this.hasProfilingMode === null) {
      // TODO: This should be a global check
      this.hasProfilingMode = isProfilingModeOn();
    }

    if (this.hasProfilingMode) {
      return (
        <React.Profiler id={name} onRender={this.handleProfilerRender}>
          {this.props.children}
        </React.Profiler>
      );
    }

    return this.props.children;
  }
}

function withProfiler<P extends object>(WrappedComponent: React.ComponentType<P>): React.FC<P> {
  const componentDisplayName = WrappedComponent.displayName || WrappedComponent.name || UNKNOWN_COMPONENT;

  const Wrapped: React.FC<P> = (props: P) => (
    <Profiler name={componentDisplayName}>
      <WrappedComponent {...props} />
    </Profiler>
  );

  Wrapped.displayName = `profiler(${componentDisplayName})`;

  // Copy over static methods from Wrapped component to Profiler HOC
  // See: https://reactjs.org/docs/higher-order-components.html#static-methods-must-be-copied-over
  hoistNonReactStatic(Wrapped, WrappedComponent);
  return Wrapped;
}

export { withProfiler, Profiler };
