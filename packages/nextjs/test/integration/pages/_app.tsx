import App, { AppContext, AppProps } from 'next/app';

const MyApp = ({ Component, pageProps }: AppProps) => {
  return <Component {...pageProps} />;
};

MyApp.getInitialProps = async (appContext: AppContext) => {
  // This simulates user misconfiguration. Users should always call `App.getInitialProps(appContext)`, but they don't,
  // so we have a test for this so we don't break their apps.
  if (appContext.ctx.pathname === '/faultyAppGetInitialProps') {
    return {};
  }

  const appProps = await App.getInitialProps(appContext);
  return { ...appProps };
};

export default MyApp;
