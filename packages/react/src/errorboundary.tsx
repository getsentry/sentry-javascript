import type { ReportDialogOptions } from '@sentry/browser';
import { getClient, showReportDialog, withScope } from '@sentry/browser';
import type { Scope } from '@sentry/core';
import { debug } from '@sentry/core';
import * as React from 'react';
import { DEBUG_BUILD } from './debug-build';
import { captureReactException } from './error';
import { hoistNonReactStatics } from './hoist-non-react-statics';

export const UNKNOWN_COMPONENT = 'unknown';

export type FallbackRender = (errorData: {
  error: unknown;
  componentStack: string;
  eventId: string;
  resetError(): void;
}) => React.ReactElement;

type OnUnmountType = {
  (error: null, componentStack: null, eventId: null): void;
  (error: unknown, componentStack: string, eventId: string): void;
};

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
  /**
   * If set to `true` or `false`, the error `handled` property will be set to the given value.
   * If unset, the default behaviour is to rely on the presence of the `fallback` prop to determine
   * if the error was handled or not.
   */
  handled?: boolean | undefined;
  /** Called when the error boundary encounters an error */
  onError?: ((error: unknown, componentStack: string, eventId: string) => void) | undefined;
  /** Called on componentDidMount() */
  onMount?: (() => void) | undefined;
  /**
   * Called when the error boundary resets due to a reset call from the
   * fallback render props function.
   */
  onReset?: ((error: unknown, componentStack: string, eventId: string) => void) | undefined;
  /**
   * Called on componentWillUnmount() with the error, componentStack, and eventId.
   *
   * If the error boundary never encountered an error, the error
   * componentStack, and eventId will be null.
   */
  onUnmount?: OnUnmountType | undefined;
  /** Called before the error is captured by Sentry, allows for you to add tags or context using the scope */
  beforeCapture?: ((scope: Scope, error: unknown, componentStack: string) => void) | undefined;
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

const INITIAL_STATE: ErrorBoundaryState = {
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
    const { beforeCapture, onError, showDialog, dialogOptions } = this.props;
    withScope(scope => {
      if (beforeCapture) {
        beforeCapture(scope, error, componentStack);
      }

      const handled = this.props.handled != null ? this.props.handled : !!this.props.fallback;
      const eventId = captureReactException(error, errorInfo, {
        mechanism: { handled, type: 'auto.function.react.error_boundary' },
      });

      if (onError) {
        onError(error, componentStack, eventId);
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
      if (this.state === INITIAL_STATE) {
        // If the error boundary never encountered an error, call onUnmount with null values
        onUnmount(null, null, null);
      } else {
        // `componentStack` and `eventId` are guaranteed to be non-null here because `onUnmount` is only called
        // when the error boundary has already encountered an error.
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        onUnmount(error, componentStack!, eventId!);
      }
    }

    if (this._cleanupHook) {
      this._cleanupHook();
      this._cleanupHook = undefined;
    }
  }

  public resetErrorBoundary(): void {
    const { onReset } = this.props;
    const { error, componentStack, eventId } = this.state;
    if (onReset) {
      // `componentStack` and `eventId` are guaranteed to be non-null here because `onReset` is only called
      // when the error boundary has already encountered an error.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      onReset(error, componentStack!, eventId!);
    }
    this.setState(INITIAL_STATE);
  }

  public render(): React.ReactNode {
    const { fallback, children } = this.props;
    const state = this.state;

    // `componentStack` is only null in the initial state, when no error has been captured.
    // If an error has been captured, `componentStack` will be a string.
    // We cannot check `state.error` because null can be thrown as an error.
    if (state.componentStack === null) {
      return typeof children === 'function' ? children() : children;
    }

    const element =
      typeof fallback === 'function'
        ? React.createElement(fallback, {
            error: state.error,
            componentStack: state.componentStack,
            resetError: () => this.resetErrorBoundary(),
            eventId: state.eventId,
          })
        : fallback;

    if (React.isValidElement(element)) {
      return element;
    }

    if (fallback) {
      DEBUG_BUILD && debug.warn('fallback did not produce a valid ReactElement');
    }

    // Fail gracefully if no fallback provided or is not valid
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withErrorBoundary<P extends Record<string, any>>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryOptions: ErrorBoundaryProps,
): React.FC<P> {
  const componentDisplayName = WrappedComponent.displayName || WrappedComponent.name || UNKNOWN_COMPONENT;

  const Wrapped = React.memo((props: P) => (
    <ErrorBoundary {...errorBoundaryOptions}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  )) as unknown as React.FC<P>;

  Wrapped.displayName = `errorBoundary(${componentDisplayName})`;

  // Copy over static methods from Wrapped component to Profiler HOC
  // See: https://reactjs.org/docs/higher-order-components.html#static-methods-must-be-copied-over
  hoistNonReactStatics(Wrapped, WrappedComponent);
  return Wrapped;
}

export { ErrorBoundary, withErrorBoundary };
