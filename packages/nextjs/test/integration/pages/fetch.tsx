const ButtonPage = (): JSX.Element => (
  <button
    onClick={() => {
      // test that a span is created in the pageload transaction for this fetch request
      fetch('http://example.com').catch(() => {
        // no-empty
      });
    }}
  >
    Send Request
  </button>
);

export default ButtonPage;
