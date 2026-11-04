// A short revalidation window, so a test can make the server prerender this page again at runtime.
export const revalidate = 1;

export default function ISRRuntimePage() {
  return (
    <div>
      <h1>ISR Runtime Page</h1>
      <div id="isr-runtime-rendered-at">{Date.now()}</div>
    </div>
  );
}
