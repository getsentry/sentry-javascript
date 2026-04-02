'use client';

export default function ErrorButton() {
  return (
    <button
      id="error-button"
      onClick={() => {
        throw new Error('E2E Test Error');
      }}
    >
      Throw Error
    </button>
  );
}
