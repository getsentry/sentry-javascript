import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';

import { ErrorBoundary, ErrorBoundaryProps } from '../src/errorboundary';

const mockCaptureException = jest.fn();
const mockShowReportDialog = jest.fn();

jest.mock('@sentry/browser', () => ({
  captureException: (err: any, ctx: any) => {
    mockCaptureException(err, ctx);
  },
  showReportDialog: (options: any) => {
    mockShowReportDialog(options);
  },
}));

const TestApp: React.FC<ErrorBoundaryProps> = ({ children, ...props }) => {
  const [isError, setError] = React.useState(false);
  return (
    <ErrorBoundary {...props}>
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

function Bam(): JSX.Element {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  jest.spyOn(console, 'error').mockImplementation();

  afterEach(() => {
    mockCaptureException.mockClear();
    mockShowReportDialog.mockClear();
  });

  it('renders null if not given a valid `fallbackRender` prop', () => {
    const { container } = render(
      // @ts-ignore
      <ErrorBoundary fallbackRender={'ok'}>
        <Bam />
      </ErrorBoundary>,
    );

    expect(container.innerHTML).toBe('');
  });

  it('renders null if not given a valid `fallback` prop', () => {
    const { container } = render(
      // @ts-ignore
      <ErrorBoundary fallback={new Error('true')}>
        <Bam />
      </ErrorBoundary>,
    );

    expect(container.innerHTML).toBe('');
  });

  it('renders a fallback on error', () => {
    const { container } = render(
      // @ts-ignore
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
    expect(mockOnUnmount).toHaveBeenCalledWith(null, null);
  });

  it('renders children correctly when there is no error', () => {
    const { container } = render(
      <ErrorBoundary fallback={<h1>Error Component</h1>}>
        <h1>children</h1>
      </ErrorBoundary>,
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

    it('renders a fallbackRender component', async () => {
      let errorString = '';
      let compStack = '';
      const { container } = render(
        <TestApp
          fallbackRender={({ error, componentStack }) => {
            if (error && componentStack) {
              errorString = error.toString();
              compStack = componentStack;
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
      expect(compStack).toBe(`
    in Bam (created by TestApp)
    in ErrorBoundary (created by TestApp)
    in TestApp`);
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
      expect(mockCaptureException).toHaveBeenCalledTimes(0);

      const btn = screen.getByTestId('errorBtn');
      fireEvent.click(btn);

      expect(mockOnError).toHaveBeenCalledTimes(1);
      expect(mockOnError).toHaveBeenCalledWith(expect.any(Error), expect.any(String));

      expect(mockCaptureException).toHaveBeenCalledTimes(1);
      expect(mockCaptureException).toHaveBeenCalledWith(expect.any(Error), {
        contexts: { react: { componentStack: expect.any(String) } },
      });
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
      expect(mockShowReportDialog).toHaveBeenCalledWith(options);
    });

    it('resets to initial state when reset', () => {
      const mockOnReset = jest.fn();
      const { container } = render(
        <TestApp
          onReset={mockOnReset}
          fallbackRender={({ resetError }) => <button data-testid="reset" onClick={resetError} />}
        >
          <h1>children</h1>
        </TestApp>,
      );

      expect(container.innerHTML).toContain('<h1>children</h1>');
      expect(mockOnReset).toHaveBeenCalledTimes(0);

      const btn = screen.getByTestId('errorBtn');
      fireEvent.click(btn);

      expect(container.innerHTML).toContain('<button data-testid="reset">');
      expect(mockOnReset).toHaveBeenCalledTimes(0);

      const reset = screen.getByTestId('reset');
      fireEvent.click(reset);
      expect(mockOnReset).toHaveBeenCalledTimes(1);
      expect(mockOnReset).toHaveBeenCalledWith(expect.any(Error), expect.any(String));
    });
  });
});
