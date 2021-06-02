const ButtonPage = (): JSX.Element => (
  <button
    onClick={() => {
      throw new Error('Sentry Frontend Error');
    }}
  >
    Throw Error
  </button>
);

export default ButtonPage;
