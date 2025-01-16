export default function SSRError() {
  const data = ['err'].map(err => {
    throw new Error('Sentry SSR Test Error');
  });

  return <div>{data}</div>;
}
