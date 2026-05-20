export default function SSRError() {
  const data = ['err'].map(() => {
    throw new Error('Sentry SSR Test Error');
  });

  return <div>{data}</div>;
}
