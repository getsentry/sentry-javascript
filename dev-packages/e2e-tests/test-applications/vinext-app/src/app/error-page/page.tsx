'use client';

export default function ErrorPage() {
  return (
    <div>
      <h1>Error Test Page</h1>
      <button
        id="error-button"
        onClick={() => {
          throw new Error('E2E Test Error');
        }}
      >
        Throw Error
      </button>
    </div>
  );
}
