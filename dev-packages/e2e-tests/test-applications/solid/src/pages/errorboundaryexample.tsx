import * as Sentry from '@sentry/solid';
import { ErrorBoundary } from 'solid-js';

const SentryErrorBoundary = Sentry.withSentryErrorBoundary(ErrorBoundary);

export default function ErrorBoundaryExample() {
  return (
    <SentryErrorBoundary
      fallback={(error, reset) => (
        <section class="bg-gray-100 text-gray-700 p-8">
          <h1 class="text-2xl font-bold">Error Boundary Fallback</h1>
          <div class="flex items-center space-x-2 mb-4">
            <code>{error.message}</code>
          </div>
          <button id="errorBoundaryResetBtn" class="border rounded-lg px-2 border-gray-900" onClick={reset}>
            Reset
          </button>
        </section>
      )}
    >
      <NonExistentComponent />
    </SentryErrorBoundary>
  );
}
