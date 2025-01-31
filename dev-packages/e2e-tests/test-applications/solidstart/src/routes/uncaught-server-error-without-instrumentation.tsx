import { createAsync } from '@solidjs/router';
const getPrefecture = async () => {
  'use server';
  throw new Error('Error thrown from Solid Start E2E test app server route without instrumentation wrapper');

  return { prefecture: 'Kanagawa' };
};

export default function UncaughtServerErrorWithoutInstrumentationPage() {
  const data = createAsync(() => getPrefecture());

  return <div>Prefecture: {data()?.prefecture}</div>;
}
