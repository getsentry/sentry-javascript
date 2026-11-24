import { Errored } from 'solid-js';

function Thrower(): never {
  throw new Error('Error thrown during SSR in Solid 2 SSR E2E test app');
}

export default function SsrError() {
  return (
    <Errored fallback={<p id="fallback">Something went wrong</p>}>
      <Thrower />
    </Errored>
  );
}
