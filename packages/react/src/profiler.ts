import * as React from 'react';
import * as React from 'react';
import { getCurrentHub } from '@sentry/browser';
import { Integration, IntegrationClass } from '@sentry/types';

/** The Props Injected by the HOC */
interface InjectedProps {
  /**  */
  finishProfile(): void;
}

const TRACING_GETTER = ({
  id: 'Tracing',
} as any) as IntegrationClass<Integration>;

const tracingIntegration = getCurrentHub().getIntegration(TRACING_GETTER);

// export default function withProfiler<P extends InjectedProps>(WrappedComponent: React.ComponentType<P>) {
//   const componentDisplayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

//   return class extends React.Component<Omit<P, keyof InjectedProps>> {
//     static displayName = `profiler(${componentDisplayName})`;

//     componentWillUnmount() {
//       this.finishProfile();
//     }

//     public activity: number | null = Integrations.Tracing.pushActivity(
//       componentDisplayName,
//       {
//         data: {},
//         op: 'react',
//         description: `<${componentDisplayName}>`,
//       },
//       {
//         // After this timeout we'll pop this activity regardless
//         // Set to 30s because that's the length of our longest requests
//         autoPopAfter: 30000,
//       },
//     );

//     // For whatever reason it's not guaranteed that `finishProfile` will be
//     // called, that's why we need the previously described timeout to make
//     // sure our transaction will be finished.
//     public finishProfile = () => {
//       if (!this.activity) {
//         return;
//       }

//       Integrations.Tracing.popActivity(this.activity);
//       this.activity = null;
//     };

//     render() {
//       return {...this.props as P} as WrappedComponent finishProfile={this.finishProfile} />;
//     }
//   };
// }
