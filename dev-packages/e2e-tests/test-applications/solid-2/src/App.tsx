import { Errored, Loading, getRequestEvent, isServer } from '@solidjs/web';
import { createMemo, createSignal } from 'solid-js';
import { explode, getPrefecture } from './data';
if (!isServer) await import('./sentry.client');

function pathname(): string {
  if (isServer) return new URL(getRequestEvent()!.request.url).pathname;
  return window.location.pathname;
}

function ServerError(): never {
  throw new Error('Error thrown from Solid 2 E2E test app server render');
}

function ClientBoundary() {
  const [fail, setFail] = createSignal(false);
  const view = createMemo(() => {
    if (fail()) throw new Error('Error thrown from Solid 2 E2E test app client render');
    return 'client content';
  });
  return (
    <>
      <button id="clientErrorBtn" onClick={() => setFail(true)}>
        break the client
      </button>
      <p id="clientContent">{view()}</p>
    </>
  );
}

function Home() {
  const [result, setResult] = createSignal('');
  return (
    <>
      <h1>Solid 2 E2E</h1>
      <button id="callBtn" onClick={async () => setResult(JSON.stringify(await getPrefecture(6)))}>
        call the server
      </button>
      <button id="explodeBtn" onClick={() => explode().catch(e => setResult(`caught: ${e.message}`))}>
        call a failing server function
      </button>
      <p id="callResult">{result()}</p>
      <a id="serverErrorLink" href="/server-error">
        server error
      </a>
    </>
  );
}

function UserPage() {
  const user = createMemo(() => getPrefecture(6));
  return (
    <Loading fallback={<p id="loading">loading…</p>}>
      <p id="user">{JSON.stringify(user())}</p>
    </Loading>
  );
}

export default function App() {
  const path = pathname();
  return (
    <main>
      {path === '/server-error' ? (
        <Errored fallback={err => <p id="serverErrorFallback">fallback: {String((err() as Error).message)}</p>}>
          <ServerError />
        </Errored>
      ) : path === '/client-error' ? (
        <Errored fallback={err => <p id="clientErrorFallback">fallback: {String((err() as Error).message)}</p>}>
          <ClientBoundary />
        </Errored>
      ) : path === '/users/6' ? (
        <UserPage />
      ) : (
        <Home />
      )}
    </main>
  );
}
