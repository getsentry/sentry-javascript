import { use } from 'react';
import { ClientErrorDebugTools } from '../../../../components/client-error-debug-tools';

export const dynamic = 'force-dynamic';

export default function Page({ params }: any) {
  // We need to dynamically check for this because Next.js made the API async for Next.js 15 and we use this test in canary tests
  const normalizedParams = 'then' in params ? use(params) : params;

  return (
    <div style={{ border: '1px solid lightgrey', padding: '12px' }}>
      <h2>Page (/server-component/[parameter])</h2>
      <p>Parameter: {JSON.stringify(normalizedParams['parameter'])}</p>
      <ClientErrorDebugTools />
    </div>
  );
}
