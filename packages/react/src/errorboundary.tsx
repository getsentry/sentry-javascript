import * as Sentry from '@sentry/browser';
import * as React from 'react';

export type ErrorBoundaryProps = {
  fallback?: React.ReactNode;
  fallbackRender?(error: Error | null, componentStack: string | null, resetErrorBoundary: () => void): React.ReactNode;
  onError?(error: Error, componentStack: string): void;
  onReset?(error: Error | null, componentStack: string | null): void;
};

type ErrorBoundaryState = {
  error: Error | null;
  componentStack: string | null;
};

const INITIAL_STATE = {
  componentStack: null,
  error: null,
};

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = INITIAL_STATE;

  public componentDidCatch(error: Error, { componentStack }: React.ErrorInfo): void {
    Sentry.withScope(scope => {
      scope.setExtra('componentStack', componentStack);
      Sentry.captureException(error);
    });
    const { onError } = this.props;
    if (onError) {
      onError(error, componentStack);
    }
    this.setState({ error, componentStack });
  }

  public resetErrorBoundary = () => {
    const { onReset } = this.props;
    if (onReset) {
      onReset(this.state.error, this.state.componentStack);
    }
    this.setState(INITIAL_STATE);
  };

  public render(): React.ReactNode {
    const { fallback, fallbackRender } = this.props;
    const { error, componentStack } = this.state;

    if (error) {
      if (typeof fallbackRender === 'function') {
        return fallbackRender(error, componentStack, this.resetErrorBoundary);
      }
      if (React.isValidElement(fallback)) {
        return fallback;
      }

      throw new Error('No fallback component has been set');
    }

    return this.props.children;
  }
}

export { ErrorBoundary };
