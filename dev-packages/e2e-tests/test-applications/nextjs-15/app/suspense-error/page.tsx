import { ClientComponentTakingAPromise } from './client-page';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const promise = fetch('http://example.com/').then(() => 'foobar');
  return <ClientComponentTakingAPromise promise={promise} />;
}
