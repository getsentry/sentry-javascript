export default function TestRenderErrorPage() {
  throw new Error('Test render error to trigger _error.tsx page');
}

// IMPORTANT: Specifically test without `getServerSideProps`
// Opt out of static pre-rendering (otherwise, we get build-time errors)
TestRenderErrorPage.getInitialProps = async () => {
  return {};
};
