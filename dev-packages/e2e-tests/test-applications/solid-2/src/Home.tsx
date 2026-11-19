import { createSignal, Errored } from 'solid-js';

function Thrower(props: { count: number }): never {
  throw new Error(`Error ${props.count} thrown from Errored boundary in Solid 2 E2E test app`);
}

export default function Home() {
  const [thrownCount, setThrownCount] = createSignal(0);
  const [activeError, setActiveError] = createSignal(0);

  return (
    <main>
      <a id="navLink" href="/user/5">
        User 5
      </a>
      <button
        id="errorBtn"
        onClick={() => {
          throw new Error('Error thrown from Solid 2 E2E test app');
        }}
      >
        Throw uncaught error
      </button>
      <button
        id="caughtErrorBtn"
        onClick={() => {
          // Solid 2 holds signal writes until the next flush, so read the new count from a local.
          const next = thrownCount() + 1;
          setThrownCount(next);
          setActiveError(next);
        }}
      >
        Throw error in boundary
      </button>
      <Errored
        fallback={(_error, reset) => (
          <button
            id="errorBoundaryResetBtn"
            onClick={() => {
              setActiveError(0);
              reset();
            }}
          >
            Reset
          </button>
        )}
      >
        {activeError() > 0 ? <Thrower count={activeError()} /> : <p id="noError">No error</p>}
      </Errored>
    </main>
  );
}
