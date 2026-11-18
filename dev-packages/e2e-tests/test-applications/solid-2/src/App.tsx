import { createSignal, Errored } from 'solid-js';

function Thrower(props: { count: number }): never {
  throw new Error(`Error ${props.count} thrown from Errored boundary in Solid 2 E2E test app`);
}

export default function App() {
  const [thrownCount, setThrownCount] = createSignal(0);
  const [activeError, setActiveError] = createSignal(0);

  return (
    <main>
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
          setThrownCount(thrownCount() + 1);
          setActiveError(thrownCount());
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
