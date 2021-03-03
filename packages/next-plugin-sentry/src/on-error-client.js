import { withScope, captureException } from '@sentry/nextjs';

export default async function onErrorClient({ err, errorInfo, renderErrorProps, data, version }) {
  // TODO: Extract some useful metadata from the router and other arguments — Kamil

  withScope(scope => {
    if (typeof errorInfo?.componentStack === 'string') {
      scope.setContext('react', {
        componentStack: errorInfo.componentStack.trim(),
      });
    }
    captureException(err);
  });
}
