export default async function Page() {
  return (
    <div>
      <p>Press to throw:</p>
      <button
        onClick={() => {
          throw new Error('client-component-button-click-error');
        }}
      >
        throw
      </button>
    </div>
  );
}
