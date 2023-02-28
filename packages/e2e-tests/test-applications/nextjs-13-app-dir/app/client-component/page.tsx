export default async function Page() {
  return (
    <div>
      <p>Press to throw:</p>
      <button
        onClick={() => {
          throw new Error(BUTTON_CLICK_ERROR_MESSAGE);
        }}
      >
        throw
      </button>
    </div>
  );
}

export const BUTTON_CLICK_ERROR_MESSAGE = 'button-click-error';
