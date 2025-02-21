// Throw error on click
export default function ClickError() {
  return (
    <div>
      <button
        onClick={() => {
          throw new Error('ClickError');
        }}
        id="click-error"
      >
        Throw error on click
      </button>
    </div>
  );
}
