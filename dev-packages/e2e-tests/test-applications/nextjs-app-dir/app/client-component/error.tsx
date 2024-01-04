'use client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ border: '1px solid lightgrey', padding: '12px' }}>
      <h2>Error (/client-component)</h2>
      <button onClick={() => reset()}>Reset</button>
      Error: {error.toString()}
    </div>
  );
}
