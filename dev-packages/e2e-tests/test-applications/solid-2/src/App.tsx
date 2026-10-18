import { createRouter, useNavigate, useParams } from '@solidjs/router';
import { Errored, Loading, isServer } from '@solidjs/web';
import { createMemo, createSignal } from 'solid-js';
import { explode, getPrefecture } from './data';
if (!isServer) await import('./sentry.client');

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
  const navigate = useNavigate();
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
      <a id="userLink" href="/users/6">
        user 6
      </a>
      <button id="userBtn" onClick={() => navigate('/users/6')}>
        go to user 6
      </button>
    </>
  );
}

function UserPage() {
  const params = useParams<{ id: string }>();
  const user = createMemo(() => getPrefecture(Number(params.id)));
  return (
    <Loading fallback={<p id="loading">loading…</p>}>
      <p id="user">{JSON.stringify(user())}</p>
    </Loading>
  );
}

// The router declares its routes to the runtime's observe tier: the route the
// document arrived on (both sides) and every navigation after it. The SDK has
// no router code; it names the pageload, navigation and request spans from
// those records.
const Router = createRouter({
  routes: [
    { path: '/', component: Home },
    { path: '/users/:id', component: UserPage },
    {
      path: '/server-error',
      component: () => (
        <Errored fallback={err => <p id="serverErrorFallback">fallback: {String((err() as Error).message)}</p>}>
          <ServerError />
        </Errored>
      ),
    },
    {
      path: '/client-error',
      component: () => (
        <Errored fallback={err => <p id="clientErrorFallback">fallback: {String((err() as Error).message)}</p>}>
          <ClientBoundary />
        </Errored>
      ),
    },
  ] as const,
});

export default function App() {
  return <Router>{props => <main>{props.children}</main>}</Router>;
}
