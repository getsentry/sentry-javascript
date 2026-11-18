import { LatestPost } from '../../components/latest-post';
import { HydrateClient, api } from '../../trpc/server';

export default async function TrpcPage() {
  const hello = await api.post.hello({ text: 'from tRPC' });

  void api.post.getLatest.prefetch();

  return (
    <HydrateClient>
      <main>
        <p>{hello ? hello.greeting : 'Loading tRPC query...'}</p>
        <LatestPost />
      </main>
    </HydrateClient>
  );
}
