import type { AppProps } from 'next/app';
import '../sentry.client.config';

export default function CustomApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
