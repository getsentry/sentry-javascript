import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { useState } from 'react';

import { init } from '../src';
import { ErrorBoundary, ErrorBoundaryProps } from '../src/errorboundary';

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

describe.only('Integration Test', () => {
  it('captures an error and sends it to Sentry', () => {
    init({
      dsn: '',
      beforeSend: event => {
        console.log(event);
        return event;
      },
    });

    render(
      <TestApp fallback={<p>You have hit an error</p>}>
        <h1>children</h1>
      </TestApp>,
    );

    const btn = screen.getByTestId('errorBtn');
    fireEvent.click(btn);
  });
});
