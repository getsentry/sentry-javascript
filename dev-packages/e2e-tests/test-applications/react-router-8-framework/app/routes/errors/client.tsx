export default function ClientErrorPage() {
  return (
    <div>
      <h1>Client Error Page</h1>
      <button
        id="throw-on-click"
        onClick={() => {
          throw new Error('¡Madre mía!');
        }}
      >
        Throw Error
      </button>
    </div>
  );
}
