import { ClientErrorDebugTools } from '../../components/client-error-debug-tools';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <div style={{ border: '1px solid lightgrey', padding: '12px' }}>
      <h2>Page (/server-component)</h2>
      <ClientErrorDebugTools />
    </div>
  );
}
