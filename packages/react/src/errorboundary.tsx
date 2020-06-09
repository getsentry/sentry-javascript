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
  /** If a Sentry report dialog should be rendered on error */
  showDialog?: boolean;
  /**
   * Options to be passed into the Sentry report dialog.
   * No-op if {@link showDialog} is false.
   */
  dialogOptions?: Sentry.ReportDialogOptions;
  // tslint:disable no-null-undefined-union
  /**
   * A fallback component that gets rendered when the error boundary encounters an error.
   *
   * Can either provide a React Component, or a function that returns React Component as
   * a valid fallback prop. If a function is provided, the function will be called with
   * the error, the component stack, and an function that resets the error boundary on error.
   *
   */
  fallback?: React.ReactNode | FallbackRender;
  // tslint:enable no-null-undefined-union
  /** Called with the error boundary encounters an error */
  onError?(error: Error, componentStack: string): void;
  /** Called on componentDidMount() */
  onMount?(): void;
  /** Called if resetError() is called from the fallback render props function  */
  onReset?(error: Error | null, componentStack: string | null): void;
  /** Called on componentWillUnmount() */
  onUnmount?(error: Error | null, componentStack: string | null): void;
};

type ErrorBoundaryState = {
  componentStack: string | null;
  error: Error | null;
};

const INITIAL_STATE = {
  componentStack: null,
  error: null,
};

/**
 * A ErrorBoundary component that logs errors to Sentry.
 * Requires React >= 16
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = INITIAL_STATE;

  public componentDidCatch(error: Error, { componentStack }: React.ErrorInfo): void {
    const eventId = Sentry.captureException(error, { contexts: { react: { componentStack } } });
    const { onError, showDialog, dialogOptions } = this.props;
    if (onError) {
      onError(error, componentStack);
    }
    if (showDialog) {
      Sentry.showReportDialog({ ...dialogOptions, eventId });
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
