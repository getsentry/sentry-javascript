export default function ClientErrorPage() {
  return (
    <div class="flex flex-col items-start space-x-2">
      <button
        class="border rounded-lg px-2 mb-2 border-red-500 text-red-500 cursor-pointer"
        id="errorBtn"
        onClick={() => {
          throw new Error('Uncaught error thrown from Solid Start E2E test app');
        }}
      >
        Throw uncaught error
      </button>
    </div>
  );
}
