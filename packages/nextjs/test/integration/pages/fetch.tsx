const ButtonPage = (): JSX.Element => (
  <button
    onClick={() => {
      fetch('http://example.com').catch(() => {
        // no-empty
      });
    }}
  >
    Send Request
  </button>
);

export default ButtonPage;
