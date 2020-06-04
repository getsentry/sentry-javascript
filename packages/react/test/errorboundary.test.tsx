import { render } from '@testing-library/react';
import * as React from 'react';

import { ErrorBoundary, ErrorBoundaryProps } from '../src/errorboundary';

describe('ErrorBoundary', () => {
  const DEFAULT_PROPS: ErrorBoundaryProps = {
    fallback: <h1>Error Component</h1>,
    fallbackRender: (error: Error, componentStack: string, resetErrorBoundary: () => void) => (
      <React.Fragment>
        <h1>{error.toString()}</h1>
        <h2>{componentStack}</h2>
        <button onClick={resetErrorBoundary} />
      </React.Fragment>
    ),
    onError: jest.fn(),
    onReset: jest.fn(),
  };

  it('Renders children with no failure', () => {
    function Bomb(): JSX.Element {
      return <p>Testing children</p>;
    }

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
  });
});
