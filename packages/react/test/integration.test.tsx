import { fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { useState } from 'react';

import { init, getCurrentHub, BrowserClient } from '../src';
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

const dsn = 'https://dogsarebadatkeepingsecrets@squirrelchasers.ingest.sentry.io/12312012';

describe('React Integration Test', () => {
  beforeAll(() => {
    init({ dsn });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    getCurrentHub().pushScope();
  });

  afterEach(() => {
    getCurrentHub().popScope();
  });

  it('captures an error and sends it to Sentry', done => {
    let capturedHint;
    let error: Error;
    let eventId: string;

    expect.assertions(6);
    getCurrentHub().bindClient(
      new BrowserClient({
        beforeSend: (event: Event) => {
          expect(event.tags).toEqual({ test: '1' });
          expect(event.exception).not.toBeUndefined();
e          done();
          return null;
        },
        dsn,
      }),
    );

    render(
      <TestApp
        fallback={<p>You have hit an error</p>}
        onError={(e, _, id) => {
          error = e;
          eventId = id;
        }}
      >
        <h1>children</h1>
      </TestApp>,
    );

    const btn = screen.getByTestId('errorBtn');
    fireEvent.click(btn);
  });
});
