import { getCurrentHub } from '@sentry/browser';
import { Integration, IntegrationClass } from '@sentry/types';
import { logger } from '@sentry/utils';
import * as hoistNonReactStatic from 'hoist-non-react-statics';
import * as React from 'react';

export const UNKNOWN_COMPONENT = 'unknown';

const TRACING_GETTER = ({
  id: 'Tracing',
} as any) as IntegrationClass<Integration>;

// https://stackoverflow.com/questions/52702466/detect-react-reactdom-development-production-build
function isReactInDevMode(): boolean {
  return '_self' in React.createElement('div');
}

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

let profilerCount = 0;

const profiledComponents: {
  [key: string]: number;
} = {};

/**
 * getInitActivity pushes activity based on React component mount
 * @param name displayName of component that started activity
 */
const getInitActivity = (name: string, shouldCancel = false): number | null => {
  const tracingIntegration = getCurrentHub().getIntegration(TRACING_GETTER);

  if (tracingIntegration === null) {
    logger.warn(
      `Unable to profile component ${name} due to invalid Tracing Integration. Please make sure to setup the Tracing integration.`,
    );

    return null;
  }

  // tslint:disable-next-line:no-unsafe-any
  const activity = (tracingIntegration as any).constructor.pushActivity(name, {
    description: `<${name}>`,
    op: 'react',
  }) as number;

  /**
   * If an activity was already generated, this the component is in React.StrictMode.
   * React.StrictMode will call constructors and setState hooks twice, effectively
   * creating redundant spans for every render (ex. two <App /> spans, two <Link /> spans)
   *
   * React.StrictMode only has this behaviour in Development Mode
   * See: https://reactjs.org/docs/strict-mode.html
   *
   * To account for this, we track all profiled components, and cancel activities that
   * we recognize to be coming from redundant push activity calls. It is important to note
   * that it is the first call to push activity that is invalid, as that is the one caused
   * by React.StrictMode.
   *
   */
  if (isReactInDevMode()) {
    // We can make the guarantee here that if a redundant activity exists, it comes right
    // before the current activity, hence having a profilerCount one less than the existing count.
    const redundantActivity = profiledComponents[String(`${name}${profilerCount - 1}`)];

    if (redundantActivity) {
      // tslint:disable: no-unsafe-any
      if (shouldCancel) {
        (tracingIntegration as any).constructor.cancelActivity(redundantActivity);
      } else {
        (tracingIntegration as any).constructor._activities[redundantActivity].span.op = 'react.strict';
      }
      // tslint:enable: no-unsafe-any
    } else {
      // If an redundant activity didn't exist, we can store the current activity to
      // check later. We have to do this inside an else block because of the case of
      // the edge case where two components may share a single components name.
      profiledComponents[String(`${name}${profilerCount}`)] = activity;
    }
  }

  profilerCount += 1;
  return activity;
};

export type ProfilerProps = {
  name: string;
};

class Profiler extends React.Component<ProfilerProps> {
  public activity: number | null;
  public constructor(props: ProfilerProps) {
    super(props);

    this.activity = getInitActivity(this.props.name, this.props.shouldCancel);
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
    return this.props.children;
  }
}

/**
 * withProfiler is a higher order component that wraps a
 * component in a {@link Profiler} component.
 *
 * @param WrappedComponent component that is wrapped by Profiler
 * @param name displayName of component being profiled
 */
function withProfiler<P extends object>(WrappedComponent: React.ComponentType<P>, name?: string): React.FC<P> {
  const componentDisplayName = name || WrappedComponent.displayName || WrappedComponent.name || UNKNOWN_COMPONENT;

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

/**
 *
 * `useProfiler` is a React hook that profiles a React component.
 *
 * Requires React 16.8 or above.
 * @param name displayName of component being profiled
 */
function useProfiler(name: string): void {
  const [activity] = React.useState(() => getInitActivity(name));

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
