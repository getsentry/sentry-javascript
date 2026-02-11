export default function ErrorBoundaryCapture() {
  return (
    <div>
      <h1>Client Error Page</h1>
      <button
        id="throw-on-click"
        onClick={() => {
          throw new Error('Sentry React Component Error');
        }}
      >
        Throw Error
      </button>
    </div>
  );
}
