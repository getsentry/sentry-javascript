import * as Sentry from '@sentry/solid';
import { ErrorBoundary, createSignal, onMount } from 'solid-js';

const SentryErrorBoundary = Sentry.withSentryErrorBoundary(ErrorBoundary);

const [count, setCount] = createSignal(1);
const [caughtError, setCaughtError] = createSignal(false);

export default function App() {
  return (
    <SampleErrorBoundary>
      {caughtError() && <Throw error={`Error ${count()} thrown from Sentry ErrorBoundary in Solid E2E test app`} />}
      <section class="bg-gray-100 text-gray-700 p-8">
        <div class="flex flex-col items-start space-x-2">
          <button
            class="border rounded-lg px-2 mb-2 border-red-500 text-red-500 cursor-pointer"
            id="caughtErrorBtn"
            onClick={() => setCaughtError(true)}
          >
            Throw caught error
          </button>
        </div>
        <div class="flex flex-col items-start space-x-2">
          <button
            class="border rounded-lg px-2 mb-2 border-red-500 text-red-500 cursor-pointer"
            id="errorBtn"
            onClick={() => {
              throw new Error('Error thrown from Solid E2E test app');
            }}
          >
            Throw uncaught error
          </button>
        </div>
      </section>
    </SampleErrorBoundary>
  );
}

function Throw(props) {
  onMount(() => {
    throw new Error(props.error);
  });
  return null;
}

function SampleErrorBoundary(props) {
  return (
    <SentryErrorBoundary
      fallback={(error, reset) => (
        <section class="bg-gray-100 text-gray-700 p-8">
          <h1 class="text-2xl font-bold">Error Boundary Fallback</h1>
          <div class="flex items-center space-x-2 mb-4">
            <code>{error.message}</code>
          </div>
          <button
            id="errorBoundaryResetBtn"
            class="border rounded-lg px-2 border-gray-900"
            onClick={() => {
              setCount(count() + 1);
              setCaughtError(false);
              reset();
            }}
          >
            Reset
          </button>
        </section>
      )}
    >
      {props.children}
    </SentryErrorBoundary>
  );
}
