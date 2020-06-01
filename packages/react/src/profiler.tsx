import { getCurrentHub } from '@sentry/browser';
import { Integration, IntegrationClass } from '@sentry/types';
import { logger } from '@sentry/utils';
import * as React from 'react';

export const DEFAULT_DURATION = 30000;
export const UNKNOWN_COMPONENT = 'unknown';

const TRACING_GETTER = ({
  id: 'Tracing',
} as any) as IntegrationClass<Integration>;

const getInitActivity = (componentDisplayName: string, timeout: number): number | null => {
  const tracingIntegration = getCurrentHub().getIntegration(TRACING_GETTER);

  if (tracingIntegration !== null) {
    // tslint:disable-next-line:no-unsafe-any
    return (tracingIntegration as any).constructor.pushActivity(
      componentDisplayName,
      {
        data: {},
        description: `<${componentDisplayName}>`,
        op: 'react',
      },
      {
        autoPopAfter: timeout,
      },
    );
  }

  logger.warn(`Unable to profile component ${componentDisplayName} due to invalid Tracing Integration`);
  return null;
};

interface ProfilerProps {
  componentDisplayName?: string;
  timeout?: number;
}

interface ProfilerState {
  activity: number | null;
}

class Profiler extends React.Component<ProfilerProps, ProfilerState> {
  public constructor(props: ProfilerProps) {
    super(props);

    const { componentDisplayName = UNKNOWN_COMPONENT, timeout = DEFAULT_DURATION } = this.props;

    this.state = {
      activity: getInitActivity(componentDisplayName, timeout),
    };
  }

  public componentWillUnmount(): void {
    this.finishProfile();
  }

  public finishProfile = () => {
    if (!this.state.activity) {
      return;
    }

    const tracingIntegration = getCurrentHub().getIntegration(TRACING_GETTER);
    if (tracingIntegration !== null) {
      // tslint:disable-next-line:no-unsafe-any
      (tracingIntegration as any).constructor.popActivity(this.state.activity);
      this.setState({ activity: null });
    }
  };

  public render(): React.ReactNode {
    return this.props.children;
  }
}

function withProfiler<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  profilerProps?: ProfilerProps,
): React.FC<P> {
  const componentDisplayName = WrappedComponent.displayName || WrappedComponent.name || UNKNOWN_COMPONENT;

  const Wrapped: React.FC<P> = (props: P) => (
    <Profiler componentDisplayName={componentDisplayName} {...profilerProps}>
      <WrappedComponent {...props} />
    </Profiler>
  );

  Wrapped.displayName = `profiler(${componentDisplayName})`;

  return Wrapped;
}

export { withProfiler, Profiler };
