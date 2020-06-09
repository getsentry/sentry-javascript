import { getCurrentHub } from '@sentry/browser';
import { Integration, IntegrationClass } from '@sentry/types';
import { logger } from '@sentry/utils';
import * as hoistNonReactStatic from 'hoist-non-react-statics';
import * as React from 'react';
// tslint:disable: no-implicit-dependencies
// @ts-ignore
import * as kap from 'scheduler';

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

// This is only active in development mode and in profiling mode
// Learn how to do that here: https://gist.github.com/bvaughn/25e6233aeb1b4f0cdb8d8366e54a3977
function isProfilingModeOn(): boolean {
  // function Hello() {
  //   return /*#__PURE__*/ React.createElement('div', null);
  // }

  // @ts-ignore
  console.log(kap);
  // const lol = React.createElement(React.Profiler, { id: 'sdf', onRender: () => {} });

  // @ts-ignore
  // console.log(lol);
  // function Kappa() {
  //   return /*#__PURE__*/ React.createElement(Hello, null);
  // }

  // I wish React exposed this better
  // tslint:disable-next-line: no-unsafe-any
  // console.log(Kappa());
  // tslint:disable-next-line: no-unsafe-any
  // if (fake._owner && fake._owner.actualDuration) {
  //   console.log('YES ITS ON');
  //   return true;
  // }

  return false;
}

const getInitActivity = (name: string): number | null => {
  const tracingIntegration = getCurrentHub().getIntegration(TRACING_GETTER);

  if (tracingIntegration !== null) {
    // tslint:disable-next-line:no-unsafe-any
    return (tracingIntegration as any).constructor.pushActivity(name, {
      description: `<${name}>`,
      op: 'react',
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
  public hasProfilingMode: boolean = false;

  public constructor(props: ProfilerProps) {
    super(props);

    // TODO: Extract this out into global state
    this.hasProfilingMode = isProfilingModeOn();

    this.activity = getInitActivity(this.props.name);
  }

  public componentDidMount(): void {
    if (!this.hasProfilingMode) {
      afterNextFrame(this.finishProfile);
    }
  }

  public componentWillUnmount(): void {
    if (!this.hasProfilingMode) {
      afterNextFrame(this.finishProfile);
    }
  }

  // TODO: Figure out how to use these values.
  // We should be generating spans from these!
  // > React calls this function any time a component within the profiled tree “commits” an update
  // See: https://reactjs.org/docs/profiler.html#onrender-callback
  // id: string,
  // phase: 'mount' | 'update',
  // actualDuration: number,
  // baseDuration: number,
  // startTime: number,
  // commitTime: number,
  public handleProfilerRender = (..._args: any[]) => {
    console.log('SDJFLSJDF');
    console.table(_args);
    afterNextFrame(this.finishProfile);
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
