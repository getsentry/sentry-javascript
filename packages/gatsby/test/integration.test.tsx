/* eslint-disable @typescript-eslint/no-explicit-any */
import { render } from '@testing-library/react';
import { useEffect } from 'react';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import * as React from 'react';

import { onClientEntry } from '../gatsby-browser';

beforeAll(() => {
  (global as any).__SENTRY_RELEASE__ = '683f3a6ab819d47d23abfca9a914c81f0524d35b';
  (global as any).__SENTRY_DSN__ = 'https://examplePublicKey@o0.ingest.sentry.io/0';
});

describe('useEffect', () => {
  it('captures error in use effect', () => {
    let calls = 0;

    onClientEntry(undefined, {
      beforeSend: (event: any) => {
        expect(event).not.toBeUndefined();
        calls += 1;

        return null;
      },
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    function TestComponent() {
      useEffect(() => {
        const error = new Error('testing 123');
        (window as any).Sentry.captureException(error);
      });

      return <div>Hello</div>;
    }

    render(<TestComponent />);

    expect(calls).toBe(1);
  });
});
