import { createSignal } from 'solid-js';
import { failingServerFunction } from './server-functions';

export default function Home() {
  const [result, setResult] = createSignal('');

  return (
    <main>
      <a id="ssrErrorLink" href="/ssr-error">
        SSR error
      </a>
      <button
        id="serverFunctionErrorBtn"
        onClick={() => {
          failingServerFunction().catch(() => setResult('server function failed'));
        }}
      >
        Call failing server function
      </button>
      <p id="result">{result()}</p>
    </main>
  );
}
