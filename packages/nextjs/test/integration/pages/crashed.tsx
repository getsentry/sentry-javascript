const CrashedPage = (): JSX.Element => {
  // Magic to naively trigger onerror to make session crashed and allow for SSR
  try {
    // @ts-ignore
    if (typeof window !== 'undefined' && typeof window.onerror === 'function') {
      // Lovely oldschool browsers syntax with 5 arguments <3
      // @ts-ignore
      window.onerror(null, null, null, null, new Error('Crashed'));
    }
  } catch (_e) {
    // no-empty
  }
  return <h1>Crashed</h1>;
};

export default CrashedPage;
