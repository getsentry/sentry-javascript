import type { ReportDialogOptions } from '@sentry/browser';
import { getClient, showReportDialog, withScope } from '@sentry/browser';
import type { Scope } from '@sentry/types';
import { logger } from '@sentry/utils';
import hoistNonReactStatics from 'hoist-non-react-statics';
import * as React from 'react';

import { DEBUG_BUILD } from './debug-build';
import { captureReactException } from './error';

export const UNKNOWN_COMPONENT = 'unknown';

export type FallbackRender = (errorData: {
  error: unknown;
  componentStack: string;
  eventId: string;
  resetError(): void;
}) => React.ReactElement;

export type ErrorBoundaryProps = {
  children?: React.ReactNode | (() => React.ReactNode);
  /** If a Sentry report dialog should be rendered on error */
  showDialog?: boolean | undefined;
  /**
   * Options to be passed into the Sentry report dialog.
   * No-op if {@link showDialog} is false.
   */
  dialogOptions?: ReportDialogOptions | undefined;
  /**
   * A fallback component that gets rendered when the error boundary encounters an error.
   *
   * Can either provide a React Component, or a function that returns React Component as
   * a valid fallback prop. If a function is provided, the function will be called with
   * the error, the component stack, and an function that resets the error boundary on error.
   *
   */
  fallback?: React.ReactElement | FallbackRender | undefined;
  /** Called when the error boundary encounters an error */
  onError?: ((error: unknown, componentStack: string | undefined, eventId: string) => void) | undefined;
  /** Called on componentDidMount() */
  onMount?: (() => void) | undefined;
  /** Called if resetError() is called from the fallback render props function  */
  onReset?: ((error: unknown, componentStack: string | null | undefined, eventId: string | null) => void) | undefined;
  /** Called on componentWillUnmount() */
  onUnmount?: ((error: unknown, componentStack: string | null | undefined, eventId: string | null) => void) | undefined;
  /** Called before the error is captured by Sentry, allows for you to add tags or context using the scope */
  beforeCapture?: ((scope: Scope, error: unknown, componentStack: string | undefined) => void) | undefined;
};

type ErrorBoundaryState =
  | {
      componentStack: null;
      error: null;
      eventId: null;
    }
  | {
      componentStack: React.ErrorInfo['componentStack'];
      error: unknown;
      eventId: string;
    };

const INITIAL_STATE = {
  componentStack: null,
  error: null,
  eventId: null,
};

/**
 * A ErrorBoundary component that logs errors to Sentry.
 * NOTE: If you are a Sentry user, and you are seeing this stack frame, it means the
 * Sentry React SDK ErrorBoundary caught an error invoking your application code. This
 * is expected behavior and NOT indicative of a bug with the Sentry React SDK.
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState;

  private readonly _openFallbackReportDialog: boolean;

  private _lastEventId?: string;
  private _cleanupHook?: () => void;

  public constructor(props: ErrorBoundaryProps) {
    super(props);

    this.state = INITIAL_STATE;
    this._openFallbackReportDialog = true;

    const client = getClient();
    if (client && props.showDialog) {
      this._openFallbackReportDialog = false;
      this._cleanupHook = client.on('afterSendEvent', event => {
        if (!event.type && this._lastEventId && event.event_id === this._lastEventId) {
          showReportDialog({ ...props.dialogOptions, eventId: this._lastEventId });
        }
      });
    }
  }

  public componentDidCatch(error: unknown, errorInfo: React.ErrorInfo): void {
    const { componentStack } = errorInfo;
    // TODO(v9): Remove this check and type `componentStack` to be React.ErrorInfo['componentStack'].
    const passedInComponentStack: React.ErrorInfo['componentStack'] = componentStack || undefined;

    const { beforeCapture, onError, showDialog, dialogOptions } = this.props;
    withScope(scope => {
      if (beforeCapture) {
        beforeCapture(scope, error, passedInComponentStack);
      }

      const eventId = captureReactException(error, errorInfo, { mechanism: { handled: !!this.props.fallback } });

      if (onError) {
        onError(error, passedInComponentStack, eventId);
      }
      if (showDialog) {
        this._lastEventId = eventId;
        if (this._openFallbackReportDialog) {
          showReportDialog({ ...dialogOptions, eventId });
        }
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

    if (this._cleanupHook) {
      this._cleanupHook();
      this._cleanupHook = undefined;
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
    const state = this.state;

    if (state.error) {
      let element: React.ReactElement | undefined = undefined;
      if (typeof fallback === 'function') {
        element = React.createElement(fallback, {
          error: state.error,
          componentStack: state.componentStack as string,
          resetError: this.resetErrorBoundary,
          eventId: state.eventId as string,
        });
      } else {
        element = fallback;
      }

      if (React.isValidElement(element)) {
        return element;
      }

      if (fallback) {
        DEBUG_BUILD && logger.warn('fallback did not produce a valid ReactElement');
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
  const componentDisplayName = WrappedComponent.displayName || WrappedComponent.name || UNKNOWN_COMPONENT;

  const Wrapped: React.FC<P> = (props: P) => (
    <ErrorBoundary {...errorBoundaryOptions}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  Wrapped.displayName = `errorBoundary(${componentDisplayName})`;

  // Copy over static methods from Wrapped component to Profiler HOC
  // See: https://reactjs.org/docs/higher-order-components.html#static-methods-must-be-copied-over
  hoistNonReactStatics(Wrapped, WrappedComponent);
  return Wrapped;
}

export { ErrorBoundary, withErrorBoundary };
