import { Scope } from '@sentry/browser';
import { Event, Severity } from '@sentry/types';
import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { useState } from 'react';

import { ErrorBoundary, ErrorBoundaryProps, UNKNOWN_COMPONENT, withErrorBoundary } from '../src/errorboundary';

const mockCaptureEvent = jest.fn();
const mockShowReportDialog = jest.fn();
const EVENT_ID = 'test-id-123';

jest.mock('@sentry/browser', () => {
  const actual = jest.requireActual('@sentry/browser');
  return {
    ...actual,
    captureEvent: (event: Event) => {
      mockCaptureEvent(event);
      return EVENT_ID;
    },
    showReportDialog: (options: any) => {
      mockShowReportDialog(options);
    },
  };
});

function Boo({ title }: { title: string }): JSX.Element {
  throw new Error(title);
}

function Bam(): JSX.Element {
  const [title] = useState('boom');
  return <Boo title={title} />;
}

const TestApp: React.FC<ErrorBoundaryProps> = ({ children, ...props }) => {
  const [isError, setError] = React.useState(false);
  return (
    <ErrorBoundary
      {...props}
      onReset={(...args) => {
        setError(false);
        if (props.onReset) {
          props.onReset(...args);
        }
      }}
    >
      {isError ? <Bam /> : children}
      <button
        data-testid="errorBtn"
        onClick={() => {
          setError(true);
        }}
      />
    </ErrorBoundary>
  );
};

describe('withErrorBoundary', () => {
  it('sets displayName properly', () => {
    const TestComponent = () => <h1>Hello World</h1>;

    const Component = withErrorBoundary(TestComponent, { fallback: <h1>fallback</h1> });
    expect(Component.displayName).toBe('errorBoundary(TestComponent)');
  });

  it('defaults to an unknown displayName', () => {
    const Component = withErrorBoundary(() => <h1>Hello World</h1>, { fallback: <h1>fallback</h1> });
    expect(Component.displayName).toBe(`errorBoundary(${UNKNOWN_COMPONENT})`);
  });
});

describe('ErrorBoundary', () => {
  jest.spyOn(console, 'error').mockImplementation();

  afterEach(() => {
    mockCaptureEvent.mockClear();
    mockShowReportDialog.mockClear();
  });

  it('renders null if not given a valid `fallback` prop', () => {
    const { container } = render(
      <ErrorBoundary fallback={new Error('true')}>
        <Bam />
      </ErrorBoundary>,
    );

    expect(container.innerHTML).toBe('');
  });

  it('renders a fallback on error', () => {
    const { container } = render(
      <ErrorBoundary fallback={<h1>Error Component</h1>}>
        <Bam />
      </ErrorBoundary>,
    );
    expect(container.innerHTML).toBe('<h1>Error Component</h1>');
  });

  it('calls `onMount` when mounted', () => {
    const mockOnMount = jest.fn();
    render(
      <ErrorBoundary fallback={<h1>Error Component</h1>} onMount={mockOnMount}>
        <h1>children</h1>
      </ErrorBoundary>,
    );

    expect(mockOnMount).toHaveBeenCalledTimes(1);
  });

  it('calls `onUnmount` when unmounted', () => {
    const mockOnUnmount = jest.fn();
    const { unmount } = render(
      <ErrorBoundary fallback={<h1>Error Component</h1>} onUnmount={mockOnUnmount}>
        <h1>children</h1>
      </ErrorBoundary>,
    );

    expect(mockOnUnmount).toHaveBeenCalledTimes(0);
    unmount();
    expect(mockOnUnmount).toHaveBeenCalledTimes(1);
    expect(mockOnUnmount).toHaveBeenCalledWith(null, null, null);
  });

  it('renders children correctly when there is no error', () => {
    const { container } = render(
      <ErrorBoundary fallback={<h1>Error Component</h1>}>
        <h1>children</h1>
      </ErrorBoundary>,
    );

    expect(container.innerHTML).toBe('<h1>children</h1>');
  });

  it('supports rendering children as a function', () => {
    const { container } = render(
      <ErrorBoundary fallback={<h1>Error Component</h1>}>{() => <h1>children</h1>}</ErrorBoundary>,
    );

    expect(container.innerHTML).toBe('<h1>children</h1>');
  });

  describe('fallback', () => {
    it('renders a fallback component', async () => {
      const { container } = render(
        <TestApp fallback={<p>You have hit an error</p>}>
          <h1>children</h1>
        </TestApp>,
      );

      expect(container.innerHTML).toContain('<h1>children</h1>');

      const btn = screen.getByTestId('errorBtn');
      fireEvent.click(btn);

      expect(container.innerHTML).not.toContain('<h1>children</h1>');
      expect(container.innerHTML).toBe('<p>You have hit an error</p>');
    });

    it('renders a render props component', async () => {
      let errorString = '';
      let compStack = '';
      let eventIdString = '';
      const { container } = render(
        <TestApp
          fallback={({ error, componentStack, eventId }) => {
            if (error && componentStack && eventId) {
              errorString = error.toString();
              compStack = componentStack;
              eventIdString = eventId;
            }
            return <div>Fallback here</div>;
          }}
        >
          <h1>children</h1>
        </TestApp>,
      );

      expect(container.innerHTML).toContain('<h1>children</h1>');

      const btn = screen.getByTestId('errorBtn');
      fireEvent.click(btn);

      expect(container.innerHTML).not.toContain('<h1>children</h1');
      expect(container.innerHTML).toBe('<div>Fallback here</div>');

      expect(errorString).toBe('Error: boom');
      /*
        at Boo (/path/to/sentry-javascript/packages/react/test/errorboundary.test.tsx:23:20)
        at Bam (/path/to/sentry-javascript/packages/react/test/errorboundary.test.tsx:40:11)
        at ErrorBoundary (/path/to/sentry-javascript/packages/react/src/errorboundary.tsx:2026:39)
        at TestApp (/path/to/sentry-javascript/packages/react/test/errorboundary.test.tsx:22:23)
      */
      expect(compStack).toMatch(
        /\s+(at Boo) \(.*?\)\s+(at Bam) \(.*?\)\s+(at ErrorBoundary) \(.*?\)\s+(at TestApp) \(.*?\)/g,
      );
      expect(eventIdString).toBe(EVENT_ID);
    });
  });

  describe('error', () => {
    it('calls `componentDidCatch() when an error occurs`', () => {
      const mockOnError = jest.fn();
      render(
        <TestApp fallback={<p>You have hit an error</p>} onError={mockOnError}>
          <h1>children</h1>
        </TestApp>,
      );

      expect(mockOnError).toHaveBeenCalledTimes(0);
      expect(mockCaptureEvent).toHaveBeenCalledTimes(0);

      const btn = screen.getByTestId('errorBtn');
      fireEvent.click(btn);

      expect(mockOnError).toHaveBeenCalledTimes(1);
      expect(mockOnError).toHaveBeenCalledWith(expect.any(Error), expect.any(String), expect.any(String));

      expect(mockCaptureEvent).toHaveBeenCalledTimes(1);

      // We do a detailed assert on the stacktrace as a regression test against future
      // react changes (that way we can update the docs if frames change in a major way).
      const event = mockCaptureEvent.mock.calls[0][0];
      expect(event.exception.values).toHaveLength(2);
      expect(event.level).toBe(Severity.Error);

      expect(event.exception.values[0].type).toEqual('React ErrorBoundary Error');
      expect(event.exception.values[0].stacktrace.frames).toEqual([
        {
          colno: expect.any(Number),
          filename: expect.stringContaining('errorboundary.test.tsx'),
          function: 'TestApp',
          in_app: true,
          lineno: expect.any(Number),
        },
        {
          colno: expect.any(Number),
          filename: expect.stringContaining('errorboundary.tsx'),
          function: 'ErrorBoundary',
          in_app: true,
          lineno: expect.any(Number),
        },
        {
          colno: expect.any(Number),
          filename: expect.stringContaining('errorboundary.test.tsx'),
          function: 'Bam',
          in_app: true,
          lineno: expect.any(Number),
        },
        {
          colno: expect.any(Number),
          filename: expect.stringContaining('errorboundary.test.tsx'),
          function: 'Boo',
          in_app: true,
          lineno: expect.any(Number),
        },
      ]);
    });

    it('calls `beforeCapture()` when an error occurs', () => {
      const mockBeforeCapture = jest.fn();

      const testBeforeCapture = (...args: any[]) => {
        expect(mockCaptureEvent).toHaveBeenCalledTimes(0);
        mockBeforeCapture(...args);
      };

      render(
        <TestApp fallback={<p>You have hit an error</p>} beforeCapture={testBeforeCapture}>
          <h1>children</h1>
        </TestApp>,
      );

      expect(mockBeforeCapture).toHaveBeenCalledTimes(0);
      expect(mockCaptureEvent).toHaveBeenCalledTimes(0);

      const btn = screen.getByTestId('errorBtn');
      fireEvent.click(btn);

      expect(mockBeforeCapture).toHaveBeenCalledTimes(1);
      expect(mockBeforeCapture).toHaveBeenLastCalledWith(expect.any(Scope), expect.any(Error), expect.any(String));
      expect(mockCaptureEvent).toHaveBeenCalledTimes(1);
    });

    it('shows a Sentry Report Dialog with correct options', () => {
      const options = { title: 'custom title' };
      render(
        <TestApp fallback={<p>You have hit an error</p>} showDialog dialogOptions={options}>
          <h1>children</h1>
        </TestApp>,
      );

      expect(mockShowReportDialog).toHaveBeenCalledTimes(0);

      const btn = screen.getByTestId('errorBtn');
      fireEvent.click(btn);

      expect(mockShowReportDialog).toHaveBeenCalledTimes(1);
      expect(mockShowReportDialog).toHaveBeenCalledWith({ ...options, eventId: EVENT_ID });
    });

    it('resets to initial state when reset', async () => {
      const { container } = render(
        <TestApp fallback={({ resetError }) => <button data-testid="reset" onClick={resetError} />}>
          <h1>children</h1>
        </TestApp>,
      );

      expect(container.innerHTML).toContain('<h1>children</h1>');
      const btn = screen.getByTestId('errorBtn');
      fireEvent.click(btn);
      expect(container.innerHTML).toContain('<button data-testid="reset">');

      const reset = screen.getByTestId('reset');
      fireEvent.click(reset);

      expect(container.innerHTML).toContain('<h1>children</h1>');
    });

    it('calls `onReset()` when reset', () => {
      const mockOnReset = jest.fn();
      render(
        <TestApp
          onReset={mockOnReset}
          fallback={({ resetError }) => <button data-testid="reset" onClick={resetError} />}
        >
          <h1>children</h1>
        </TestApp>,
      );

      expect(mockOnReset).toHaveBeenCalledTimes(0);
      const btn = screen.getByTestId('errorBtn');
      fireEvent.click(btn);
      expect(mockOnReset).toHaveBeenCalledTimes(0);

      const reset = screen.getByTestId('reset');
      fireEvent.click(reset);

      expect(mockOnReset).toHaveBeenCalledTimes(1);
      expect(mockOnReset).toHaveBeenCalledWith(expect.any(Error), expect.any(String), expect.any(String));
    });
  });
});
