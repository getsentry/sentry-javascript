/**
 * @vitest-environment jsdom
 */
import { getClient, Scope, setCurrentClient } from '@sentry/browser';
import type { Client } from '@sentry/core';
import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ErrorBoundaryProps, FallbackRender } from '../src/errorboundary';
import { ErrorBoundary, UNKNOWN_COMPONENT, withErrorBoundary } from '../src/errorboundary';

const mockScope = new Scope();
const scopeSetContextSpy = vi.spyOn(mockScope, 'setContext');
const mockCaptureException = vi.fn();
const mockShowReportDialog = vi.fn();
const mockClientOn = vi.fn();
const EVENT_ID = 'test-id-123';

vi.mock('@sentry/browser', async requireActual => {
  return {
    ...(await requireActual()),
    captureException: (...args: unknown[]) => {
      mockCaptureException(...args);
      return EVENT_ID;
    },
    showReportDialog: (options: any) => {
      mockShowReportDialog(options);
    },
    withScope: (callback: (scope: any) => any) => {
      return callback(mockScope);
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

function EffectSpyFallback({ error }: { error: unknown }): JSX.Element {
  const [counter, setCounter] = useState(0);

  React.useEffect(() => {
    setCounter(c => c + 1);
  }, []);

  return (
    <span>
      EffectSpyFallback {counter} - {(error as Error).message}
    </span>
  );
}

interface TestAppProps extends ErrorBoundaryProps {
  errorComp?: JSX.Element;
}

const TestApp: React.FC<TestAppProps> = ({ children, errorComp, ...props }): any => {
  const customErrorComp = errorComp || <Bam />;
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
      {isError ? customErrorComp : children}
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

  it('does not rerender when props are identical', () => {
    let renderCount = 0;
    const TestComponent = ({ title }: { title: string }) => {
      renderCount++;
      return <h1>{title}</h1>;
    };

    const WrappedComponent = withErrorBoundary(TestComponent, { fallback: <h1>fallback</h1> });
    const { rerender } = render(<WrappedComponent title="test" />);

    expect(renderCount).toBe(1);

    // Rerender with identical props - should not cause TestComponent to rerender
    rerender(<WrappedComponent title="test" />);
    expect(renderCount).toBe(1);

    // Rerender with different props - should cause TestComponent to rerender
    rerender(<WrappedComponent title="different" />);
    expect(renderCount).toBe(2);
  });

  it('does not rerender when complex props are identical', () => {
    let renderCount = 0;
    const TestComponent = ({ data }: { data: { id: number; name: string } }) => {
      renderCount++;
      return <h1>{data.name}</h1>;
    };

    const WrappedComponent = withErrorBoundary(TestComponent, { fallback: <h1>fallback</h1> });
    const props = { data: { id: 1, name: 'test' } };
    const { rerender } = render(<WrappedComponent {...props} />);

    expect(renderCount).toBe(1);

    // Rerender with same object reference - should not cause TestComponent to rerender
    rerender(<WrappedComponent {...props} />);
    expect(renderCount).toBe(1);

    // Rerender with different object but same values - should cause rerender
    rerender(<WrappedComponent data={{ id: 1, name: 'test' }} />);
    expect(renderCount).toBe(2);

    // Rerender with different values - should cause rerender
    rerender(<WrappedComponent data={{ id: 2, name: 'different' }} />);
    expect(renderCount).toBe(3);
  });

  it('does not rerender when errorBoundaryOptions are the same', () => {
    let renderCount = 0;
    const TestComponent = ({ title }: { title: string }) => {
      renderCount++;
      return <h1>{title}</h1>;
    };

    const errorBoundaryOptions = { fallback: <h1>fallback</h1> };
    const WrappedComponent = withErrorBoundary(TestComponent, errorBoundaryOptions);
    const { rerender } = render(<WrappedComponent title="test" />);

    expect(renderCount).toBe(1);

    // Rerender with identical props - should not cause TestComponent to rerender
    rerender(<WrappedComponent title="test" />);
    expect(renderCount).toBe(1);
  });

  it('preserves function component behavior with React.memo', () => {
    const TestComponent = ({ title }: { title: string }) => <h1>{title}</h1>;
    const WrappedComponent = withErrorBoundary(TestComponent, { fallback: <h1>fallback</h1> });

    expect(WrappedComponent).toBeDefined();
    expect(typeof WrappedComponent).toBe('object');
    expect(WrappedComponent.displayName).toBe('errorBoundary(TestComponent)');

    const { container } = render(<WrappedComponent title="test" />);
    expect(container.innerHTML).toContain('test');
  });

  it('does not rerender parent component unnecessarily', () => {
    let parentRenderCount = 0;
    let childRenderCount = 0;

    const ChildComponent = ({ value }: { value: number }) => {
      childRenderCount++;
      return <div>Child: {value}</div>;
    };

    const WrappedChild = withErrorBoundary(ChildComponent, { fallback: <div>Error</div> });

    const ParentComponent = ({ childValue, otherProp }: { childValue: number; otherProp: string }) => {
      parentRenderCount++;
      return (
        <div>
          <div>Parent: {otherProp}</div>
          <WrappedChild value={childValue} />
        </div>
      );
    };

    const { rerender } = render(<ParentComponent childValue={1} otherProp="test" />);

    expect(parentRenderCount).toBe(1);
    expect(childRenderCount).toBe(1);

    // Change otherProp but keep childValue the same
    rerender(<ParentComponent childValue={1} otherProp="changed" />);

    expect(parentRenderCount).toBe(2); // Parent should rerender
    expect(childRenderCount).toBe(1); // Child should NOT rerender due to memo

    // Change childValue
    rerender(<ParentComponent childValue={2} otherProp="changed" />);

    expect(parentRenderCount).toBe(3); // Parent should rerender
    expect(childRenderCount).toBe(2); // Child should rerender due to changed props
  });
});

describe('ErrorBoundary', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});

  afterEach(() => {
    mockCaptureException.mockClear();
    mockShowReportDialog.mockClear();
    mockClientOn.mockClear();
    (mockScope.setContext as any).mockClear();
  });

  it('renders null if not given a valid `fallback` prop', () => {
    const { container } = render(
      // @ts-expect-error Passing wrong type on purpose
      <ErrorBoundary fallback="Not a ReactElement">
        <Bam />
      </ErrorBoundary>,
    );

    expect(container.innerHTML).toBe('');
  });

  it('renders null if not given a valid `fallback` prop function', () => {
    const { container } = render(
      // @ts-expect-error Passing wrong type on purpose
      <ErrorBoundary fallback={() => undefined}>
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

  it('renders a fallback that can use react hooks', () => {
    const { container } = render(
      <ErrorBoundary fallback={EffectSpyFallback}>
        <Bam />
      </ErrorBoundary>,
    );
    expect(container.innerHTML).toBe('<span>EffectSpyFallback 1 - boom</span>');
  });

  it('calls `onMount` when mounted', () => {
    const mockOnMount = vi.fn();
    render(
      <ErrorBoundary fallback={<h1>Error Component</h1>} onMount={mockOnMount}>
        <h1>children</h1>
      </ErrorBoundary>,
    );

    expect(mockOnMount).toHaveBeenCalledTimes(1);
  });

  it('calls `onUnmount` when unmounted', () => {
    const mockOnUnmount = vi.fn();
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
      const mockOnError = vi.fn();
      render(
        <TestApp fallback={<p>You have hit an error</p>} onError={mockOnError}>
          <h1>children</h1>
        </TestApp>,
      );

      expect(mockOnError).toHaveBeenCalledTimes(0);
      expect(mockCaptureException).toHaveBeenCalledTimes(0);

      const btn = screen.getByTestId('errorBtn');
      fireEvent.click(btn);

      expect(mockOnError).toHaveBeenCalledTimes(1);
      expect(mockOnError).toHaveBeenCalledWith(expect.any(Error), expect.any(String), expect.any(String));

      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      expect(mockCaptureException).toHaveBeenLastCalledWith(expect.any(Error), {
        mechanism: { handled: true, type: 'auto.function.react.error_boundary' },
      });

      expect(scopeSetContextSpy).toHaveBeenCalledTimes(1);
      expect(scopeSetContextSpy).toHaveBeenCalledWith('react', { componentStack: expect.any(String) });

      expect(mockOnError.mock.calls[0]?.[0]).toEqual(mockCaptureException.mock.calls[0]?.[0]);

      // Check if error.cause -> react component stack
      const error = mockCaptureException.mock.calls[0]?.[0];
      const cause = error.cause;

      expect(cause.stack).toEqual(scopeSetContextSpy.mock.calls[0]?.[1]?.componentStack);
      expect(cause.name).toContain('React ErrorBoundary');
      expect(cause.message).toEqual(error.message);
    });

    // Regression test against:
    // https://github.com/getsentry/sentry-javascript/issues/6167
    it('does not set cause if non Error objected is thrown', () => {
      const TestAppThrowingString: React.FC<ErrorBoundaryProps> = ({ children, ...props }) => {
        const [isError, setError] = React.useState(false);
        function StringBam(): JSX.Element {
          throw 'bam';
        }
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
            {isError ? <StringBam /> : children}
            <button
              data-testid="errorBtn"
              onClick={() => {
                setError(true);
              }}
            />
          </ErrorBoundary>
        );
      };

      render(
        <TestAppThrowingString fallback={<p>You have hit an error</p>}>
          <h1>children</h1>
        </TestAppThrowingString>,
      );

      expect(mockCaptureException).toHaveBeenCalledTimes(0);

      const btn = screen.getByTestId('errorBtn');
      fireEvent.click(btn);

      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      expect(mockCaptureException).toHaveBeenLastCalledWith('bam', {
        mechanism: { handled: true, type: 'auto.function.react.error_boundary' },
      });

      expect(scopeSetContextSpy).toHaveBeenCalledTimes(1);
      expect(scopeSetContextSpy).toHaveBeenCalledWith('react', { componentStack: expect.any(String) });

      // Check if error.cause -> react component stack
      const error = mockCaptureException.mock.calls[0]?.[0];
      expect(error.cause).not.toBeDefined();
    });

    it('handles when `error.cause` is nested', () => {
      const mockOnError = vi.fn();

      function CustomBam(): JSX.Element {
        const firstError = new Error('bam');
        const secondError = new Error('bam2');
        const thirdError = new Error('bam3');
        // @ts-expect-error Need to set cause on error
        secondError.cause = firstError;
        // @ts-expect-error Need to set cause on error
        thirdError.cause = secondError;
        throw thirdError;
      }

      render(
        <TestApp fallback={<p>You have hit an error</p>} onError={mockOnError} errorComp={<CustomBam />}>
          <h1>children</h1>
        </TestApp>,
      );

      expect(mockOnError).toHaveBeenCalledTimes(0);
      expect(mockCaptureException).toHaveBeenCalledTimes(0);

      const btn = screen.getByTestId('errorBtn');
      fireEvent.click(btn);

      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      expect(mockCaptureException).toHaveBeenLastCalledWith(expect.any(Error), {
        mechanism: { handled: true, type: 'auto.function.react.error_boundary' },
      });

      expect(scopeSetContextSpy).toHaveBeenCalledTimes(1);
      expect(scopeSetContextSpy).toHaveBeenCalledWith('react', { componentStack: expect.any(String) });

      expect(mockOnError.mock.calls[0]?.[0]).toEqual(mockCaptureException.mock.calls[0]?.[0]);

      const thirdError = mockCaptureException.mock.calls[0]?.[0];
      const secondError = thirdError.cause;
      const firstError = secondError.cause;
      const cause = firstError.cause;
      expect(cause.stack).toEqual(scopeSetContextSpy.mock.calls[0]?.[1]?.componentStack);
      expect(cause.name).toContain('React ErrorBoundary');
      expect(cause.message).toEqual(thirdError.message);
    });

    it('handles when `error.cause` is recursive', () => {
      const mockOnError = vi.fn();

      function CustomBam(): JSX.Element {
        const firstError = new Error('bam');
        const secondError = new Error('bam2');
        // @ts-expect-error Need to set cause on error
        firstError.cause = secondError;
        // @ts-expect-error Need to set cause on error
        secondError.cause = firstError;
        throw firstError;
      }

      render(
        <TestApp fallback={<p>You have hit an error</p>} onError={mockOnError} errorComp={<CustomBam />}>
          <h1>children</h1>
        </TestApp>,
      );

      expect(mockOnError).toHaveBeenCalledTimes(0);
      expect(mockCaptureException).toHaveBeenCalledTimes(0);

      const btn = screen.getByTestId('errorBtn');
      fireEvent.click(btn);

      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      expect(mockCaptureException).toHaveBeenLastCalledWith(expect.any(Error), {
        mechanism: { handled: true, type: 'auto.function.react.error_boundary' },
      });

      expect(scopeSetContextSpy).toHaveBeenCalledTimes(1);
      expect(scopeSetContextSpy).toHaveBeenCalledWith('react', { componentStack: expect.any(String) });

      expect(mockOnError.mock.calls[0]?.[0]).toEqual(mockCaptureException.mock.calls[0]?.[0]);

      const error = mockCaptureException.mock.calls[0]?.[0];
      const cause = error.cause;
      // We need to make sure that recursive error.cause does not cause infinite loop
      expect(cause.stack).not.toEqual(scopeSetContextSpy.mock.calls[0]?.[1]?.componentStack);
      expect(cause.name).not.toContain('React ErrorBoundary');
    });

    it('calls `beforeCapture()` when an error occurs', () => {
      const mockBeforeCapture = vi.fn();

      const testBeforeCapture = (...args: any[]) => {
        expect(mockCaptureException).toHaveBeenCalledTimes(0);
        mockBeforeCapture(...args);
      };

      render(
        <TestApp fallback={<p>You have hit an error</p>} beforeCapture={testBeforeCapture}>
          <h1>children</h1>
        </TestApp>,
      );

      expect(mockBeforeCapture).toHaveBeenCalledTimes(0);
      expect(mockCaptureException).toHaveBeenCalledTimes(0);

      const btn = screen.getByTestId('errorBtn');
      fireEvent.click(btn);

      expect(mockBeforeCapture).toHaveBeenCalledTimes(1);
      expect(mockBeforeCapture).toHaveBeenLastCalledWith(expect.any(Scope), expect.any(Error), expect.any(String));
      expect(mockCaptureException).toHaveBeenCalledTimes(1);
    });

    it('shows a Sentry Report Dialog with correct options if client does not have hooks', () => {
      expect(getClient()).toBeUndefined();

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

    it('shows a Sentry Report Dialog with correct options if client has hooks', () => {
      let callback: any;

      const clientBefore = getClient();

      const client = {
        on: (name: string, cb: any) => {
          callback = cb;
        },
      } as Client;

      setCurrentClient(client);

      const options = { title: 'custom title' };
      render(
        <TestApp fallback={<p>You have hit an error</p>} showDialog dialogOptions={options}>
          <h1>children</h1>
        </TestApp>,
      );

      expect(mockShowReportDialog).toHaveBeenCalledTimes(0);

      const btn = screen.getByTestId('errorBtn');
      fireEvent.click(btn);

      // Simulate hook being fired
      callback({ event_id: EVENT_ID });

      expect(mockShowReportDialog).toHaveBeenCalledTimes(1);
      expect(mockShowReportDialog).toHaveBeenCalledWith({ ...options, eventId: EVENT_ID });

      setCurrentClient(clientBefore!);
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
      const mockOnReset = vi.fn();
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
    it.each`
      fallback | handled      | expected
      ${true}  | ${undefined} | ${true}
      ${false} | ${undefined} | ${false}
      ${true}  | ${false}     | ${false}
      ${true}  | ${true}      | ${true}
      ${false} | ${true}      | ${true}
      ${false} | ${false}     | ${false}
    `(
      'sets `handled: $expected` when `handled` is $handled and `fallback` is $fallback',
      async ({
        fallback,
        handled,
        expected,
      }: {
        fallback: boolean;
        handled: boolean | undefined;
        expected: boolean;
      }) => {
        const fallbackComponent: FallbackRender | undefined = fallback
          ? ({ resetError }) => <button data-testid="reset" onClick={resetError} />
          : undefined;
        render(
          <TestApp handled={handled} fallback={fallbackComponent}>
            <h1>children</h1>
          </TestApp>,
        );

        expect(mockCaptureException).toHaveBeenCalledTimes(0);

        const btn = screen.getByTestId('errorBtn');
        fireEvent.click(btn);

        expect(mockCaptureException).toHaveBeenCalledTimes(1);
        expect(mockCaptureException).toHaveBeenLastCalledWith(expect.any(Object), {
          mechanism: { handled: expected, type: 'auto.function.react.error_boundary' },
        });

        expect(scopeSetContextSpy).toHaveBeenCalledTimes(1);
        expect(scopeSetContextSpy).toHaveBeenCalledWith('react', { componentStack: expect.any(String) });
      },
    );
  });
});
