'use client';

export default function Page() {
  return (
    <div>
      <p>Press to throw:</p>
      <button
        id="exception-button"
        onClick={() => {
          throw new Error('client-component-button-click-error');
        }}
      >
        throw
      </button>
    </div>
  );
}
