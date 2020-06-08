import * as Sentry from '@sentry/browser';
import * as hoistNonReactStatic from 'hoist-non-react-statics';
import * as React from 'react';

export const UNKNOWN_COMPONENT = 'unknown';

export type FallbackRender = (fallback: {
  error: Error | null;
  componentStack: string | null;
  resetError(): void;
}) => React.ReactNode;

export type ErrorBoundaryProps = {
  showDialog?: boolean;
  dialogOptions?: Sentry.ReportDialogOptions;
  // tslint:disable-next-line: no-null-undefined-union
  fallback?: React.ReactNode | FallbackRender;
  onError?(error: Error, componentStack: string): void;
  onMount?(): void;
  onReset?(error: Error | null, componentStack: string | null): void;
  onUnmount?(error: Error | null, componentStack: string | null): void;
};

/*
  fallbackRender?(fallback: {
    error: Error | null;
    componentStack: string | null;
    resetError(): void;
  }): React.ReactNode;
*/

type ErrorBoundaryState = {
  componentStack: string | null;
  error: Error | null;
};

const INITIAL_STATE = {
  componentStack: null,
  error: null,
};

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = INITIAL_STATE;

  public componentDidCatch(error: Error, { componentStack }: React.ErrorInfo): void {
    Sentry.captureException(error, { contexts: { react: { componentStack } } });
    const { onError, showDialog, dialogOptions } = this.props;
    if (onError) {
      onError(error, componentStack);
    }
    if (showDialog) {
      Sentry.showReportDialog(dialogOptions);
    }

    // componentDidCatch is used over getDerivedStateFromError
    // so that componentStack is accessible through state.
    this.setState({ error, componentStack });
  }

  public componentDidMount(): void {
    const { onMount } = this.props;
    if (onMount) {
      onMount();
    }
  }

  public componentWillUnmount(): void {
    const { error, componentStack } = this.state;
    const { onUnmount } = this.props;
    if (onUnmount) {
      onUnmount(error, componentStack);
    }
  }

  public resetErrorBoundary = () => {
    const { onReset } = this.props;
    if (onReset) {
      onReset(this.state.error, this.state.componentStack);
    }
    this.setState(INITIAL_STATE);
  };

  public render(): React.ReactNode {
    const { fallback } = this.props;
    const { error, componentStack } = this.state;

    if (error) {
      if (React.isValidElement(fallback)) {
        return fallback;
      }
      if (typeof fallback === 'function') {
        return fallback({ error, componentStack, resetError: this.resetErrorBoundary }) as FallbackRender;
      }

      // Fail gracefully if no fallback provided
      return null;
    }

    return this.props.children;
  }
}

function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryOptions: ErrorBoundaryProps,
): React.FC<P> {
  const componentDisplayName = WrappedComponent.displayName || WrappedComponent.name || UNKNOWN_COMPONENT;

  const Wrapped: React.FC<P> = (props: P) => (
    <ErrorBoundary {...errorBoundaryOptions}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  Wrapped.displayName = `errorBoundary(${componentDisplayName})`;

  // Copy over static methods from Wrapped component to Profiler HOC
  // See: https://reactjs.org/docs/higher-order-components.html#static-methods-must-be-copied-over
  hoistNonReactStatic(Wrapped, WrappedComponent);
  return Wrapped;
}

export { ErrorBoundary, withErrorBoundary };
