import { getCurrentHub } from '@sentry/browser';
import { Integration, IntegrationClass } from '@sentry/types';
import * as React from 'react';

/** The Props Injected by the HOC */
interface InjectedProps {
  /** Called when a transaction is finished */
  finishProfile(): void;
}

const DEFAULT_DURATION = 30000;

const TRACING_GETTER = ({
  id: 'Tracing',
} as any) as IntegrationClass<Integration>;

const getInitActivity = (componentDisplayName: string, timeout = DEFAULT_DURATION): number | null => {
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

  return null;
};

// tslint:disable-next-line: variable-name
export const withProfiler = <P extends object>(WrappedComponent: React.ComponentType<P>, timeout?: number) => {
  const componentDisplayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

  return class WithProfiler extends React.Component<Omit<P, keyof InjectedProps>>  {
    public static displayName: string = `profiler(${componentDisplayName})`;

    public activity: number | null = getInitActivity(componentDisplayName, timeout);

    // tslint:disable-next-line: completed-docs
    public componentWillUnmount(): void {
      this.finishProfile();
    }

    public finishProfile = () => {
      if(!this.activity) {
        return;
      }

      const tracingIntegration = getCurrentHub().getIntegration(TRACING_GETTER);
      if (tracingIntegration !== null) {
        // tslint:disable-next-line:no-unsafe-any
        (tracingIntegration as any).constructor.popActivity(this.activity);
        this.activity = null
      }
    }

    // tslint:disable-next-line: completed-docs
    public render(): React.ReactNode {
      return <WrappedComponent {...this.props as P} finishProfile={this.finishProfile} />;
    }
  };
};
