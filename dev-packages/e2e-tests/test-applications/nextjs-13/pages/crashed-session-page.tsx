export default function CrashedPage() {
  // Magic to naively trigger onerror to make session crashed and allow for SSR
  try {
    if (typeof window !== 'undefined' && typeof window.onerror === 'function') {
      // Lovely oldschool browsers syntax with 5 arguments <3
      // @ts-expect-error
      window.onerror(null, null, null, null, new Error('Crashed'));
    }
  } catch {
    // no-empty
  }
  return <h1>Crashed</h1>;
}
