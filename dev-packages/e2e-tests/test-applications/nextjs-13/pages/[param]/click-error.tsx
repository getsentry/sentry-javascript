export default function ClickErrorPage() {
  return (
    <button
      id="error-button"
      onClick={() => {
        throw new Error('click error');
      }}
    >
      click to throw error
    </button>
  );
}
