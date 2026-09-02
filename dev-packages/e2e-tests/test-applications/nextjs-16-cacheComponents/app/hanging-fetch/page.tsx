// This `fetch()` deliberately has no cache configuration. Under Cache Components, Next.js does not
// issue such a request during a prerender - it hands out a promise that never settles and rejects it
// with a `HANGING_PROMISE_REJECTION` digest once the prerender is aborted. That rejection surfaces in
// this component and therefore in the Sentry server component wrapper, which must not report it.
export default async function Page() {
  const response = await fetch('http://localhost:3030/api/hanging-fetch-data');
  const data = (await response.json()) as { value: string };

  return <p id="fetched-value">{data.value}</p>;
}
