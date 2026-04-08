import { useFetcher } from 'react-router';
import type { Route } from './+types/fetcher-test';

export async function loader() {
  return { message: 'Fetcher test page loaded' };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const value = formData.get('value')?.toString() || '';
  await new Promise(resolve => setTimeout(resolve, 50));
  return { success: true, value };
}

export default function FetcherTestPage() {
  const fetcher = useFetcher();

  return (
    <div>
      <h1 id="fetcher-test-title">Fetcher Test Page</h1>
      <fetcher.Form method="post">
        <input type="hidden" name="value" value="test-value" />
        <button type="submit" id="fetcher-submit">
          Submit via Fetcher
        </button>
      </fetcher.Form>
      {fetcher.data?.success && <div id="fetcher-result">Fetcher result: {fetcher.data.value}</div>}
    </div>
  );
}
