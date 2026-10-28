'use client';

import * as Sentry from '@sentry/nextjs';

function throwFirstPartyError(): void {
  throw new Error('first-party-error');
}

export default function Page() {
  return (
    <>
      <button
        id="first-party-error-btn"
        onClick={() => {
          try {
            throwFirstPartyError();
          } catch (e) {
            Sentry.captureException(e);
          }
        }}
      >
        Throw First Party Error
      </button>
      <button
        id="dependency-error-btn"
        onClick={async () => {
          const { createDependencyError } = await import('sentry-metadata-test-dependency');
          Sentry.captureException(createDependencyError());
        }}
      >
        Capture Dependency Error
      </button>
    </>
  );
}
