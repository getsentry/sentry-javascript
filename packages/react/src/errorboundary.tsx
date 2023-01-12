import type { ReportDialogOptions, Scope} from '@sentry/browser';
import { captureException, showReportDialog, withScope } from '@sentry/browser';
import { isError, logger } from '@sentry/utils';
import hoistNonReactStatics from 'hoist-non-react-statics';
import * as React from 'react';

export function isAtLeastReact17(version: string): boolean {
  const major = version.match(/^([^.]+)/);
  return major !== null && parseInt(major[0]) >= 17;
}

export const UNKNOWN_COMPONENT = 'unknown';

export type FallbackRender = (errorData: {
  error: Error;
  componentStack: string | null;
  eventId: string | null;
  resetError(): void;
}) => React.ReactElement;

export type ErrorBoundaryProps = {
  children?: React.ReactNode | (() => React.ReactNode);
  /** If a Sentry report dialog should be rendered on error */
  showDialog?: boolean;
  /**
   * Options to be passed into the Sentry report dialog.
   * No-op if {@link showDialog} is false.
   */
  dialogOptions?: ReportDialogOptions;
  /**
   * A fallback component that gets rendered when the error boundary encounters an error.
   *
   * Can either provide a React Component, or a function that returns React Component as
   * a valid fallback prop. If a function is provided, the function will be called with
   * the error, the component stack, and an function that resets the error boundary on error.
   *
   */
  fallback?: React.ReactElement | FallbackRender;
  /** Called when the error boundary encounters an error */
  onError?(error: Error, componentStack: string, eventId: string): void;
  /** Called on componentDidMount() */
  onMount?(): void;
  /** Called if resetError() is called from the fallback render props function  */
  onReset?(error: Error | null, componentStack: string | null, eventId: string | null): void;
  /** Called on componentWillUnmount() */
  onUnmount?(error: Error | null, componentStack: string | null, eventId: string | null): void;
  /** Called before the error is captured by Sentry, allows for you to add tags or context using the scope */
  beforeCapture?(scope: Scope, error: Error | null, componentStack: string | null): void;
};

type ErrorBoundaryState = {
  componentStack: React.ErrorInfo['componentStack'] | null;
  error: Error | null;
  eventId: string | null;
};

const INITIAL_STATE = {
  componentStack: null,
  error: null,
  eventId: null,
};

/**
 * A ErrorBoundary component that logs errors to Sentry. Requires React >= 16.
 * NOTE: If you are a Sentry user, and you are seeing this stack frame, it means the
 * Sentry React SDK ErrorBoundary caught an error invoking your application code. This
 * is expected behavior and NOT indicative of a bug with the Sentry React SDK.
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = INITIAL_STATE;

  public componentDidCatch(error: Error & { cause?: Error }, { componentStack }: React.ErrorInfo): void {
    const { beforeCapture, onError, showDialog, dialogOptions } = this.props;

    withScope(scope => {
      // If on React version >= 17, create stack trace from componentStack param and links
      // to to the original error using `error.cause` otherwise relies on error param for stacktrace.
      // Linking errors requires the `LinkedErrors` integration be enabled.
      // See: https://reactjs.org/blog/2020/08/10/react-v17-rc.html#native-component-stacks
      //
      // Although `componentDidCatch` is typed to accept an `Error` object, it can also be invoked
      // with non-error objects. This is why we need to check if the error is an error-like object.
      // See: https://github.com/getsentry/sentry-javascript/issues/6167
      if (isAtLeastReact17(React.version) && isError(error)) {
        const errorBoundaryError = new Error(error.message);
        errorBoundaryError.name = `React ErrorBoundary ${errorBoundaryError.name}`;
        errorBoundaryError.stack = componentStack;

        // Using the `LinkedErrors` integration to link the errors together.
        error.cause = errorBoundaryError;
      }

      if (beforeCapture) {
        beforeCapture(scope, error, componentStack);
      }
      const eventId = captureException(error, { contexts: { react: { componentStack } } });
      if (onError) {
        onError(error, componentStack, eventId);
      }
      if (showDialog) {
        showReportDialog({ ...dialogOptions, eventId });
      }

      // componentDidCatch is used over getDerivedStateFromError
      // so that componentStack is accessible through state.
      this.setState({ error, componentStack, eventId });
    });
  }

  public componentDidMount(): void {
    const { onMount } = this.props;
    if (onMount) {
      onMount();
    }
  }

  public componentWillUnmount(): void {
    const { error, componentStack, eventId } = this.state;
    const { onUnmount } = this.props;
    if (onUnmount) {
      onUnmount(error, componentStack, eventId);
    }
  }

  public resetErrorBoundary: () => void = () => {
    const { onReset } = this.props;
    const { error, componentStack, eventId } = this.state;
    if (onReset) {
      onReset(error, componentStack, eventId);
    }
    this.setState(INITIAL_STATE);
  };

  public render(): React.ReactNode {
    const { fallback, children } = this.props;
    const { error, componentStack, eventId } = this.state;

    if (error) {
      let element: React.ReactElement | undefined = undefined;
      if (typeof fallback === 'function') {
        element = fallback({ error, componentStack, resetError: this.resetErrorBoundary, eventId });
      } else {
        element = fallback;
      }

      if (React.isValidElement(element)) {
        return element;
      }

      if (fallback) {
        __DEBUG_BUILD__ && logger.warn('fallback did not produce a valid ReactElement');
      }

      // Fail gracefully if no fallback provided or is not valid
      return null;
    }

    if (typeof children === 'function') {
      return (children as () => React.ReactNode)();
    }
    return children;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withErrorBoundary<P extends Record<string, any>>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryOptions: ErrorBoundaryProps,
): React.FC<P> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const componentDisplayName = WrappedComponent.displayName || WrappedComponent.name || UNKNOWN_COMPONENT;

  const Wrapped: React.FC<P> = (props: P) => (
    <ErrorBoundary {...errorBoundaryOptions}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  Wrapped.displayName = `errorBoundary(${componentDisplayName})`;

  // Copy over static methods from Wrapped component to Profiler HOC
  // See: https://reactjs.org/docs/higher-order-components.html#static-methods-must-be-copied-over
  hoistNonReactStatics(Wrapped, WrappedComponent);
  return Wrapped;
}

export { ErrorBoundary, withErrorBoundary };
