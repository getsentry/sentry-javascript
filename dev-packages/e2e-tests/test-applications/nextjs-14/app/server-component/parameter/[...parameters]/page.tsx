import { ClientErrorDebugTools } from '../../../../components/client-error-debug-tools';

export const dynamic = 'force-dynamic';

export default function Page({ params }: any) {
  return (
    <div style={{ border: '1px solid lightgrey', padding: '12px' }}>
      <h2>Page (/server-component/[...parameters])</h2>
      <p>Params: {JSON.stringify(params['parameters'])}</p>
      <ClientErrorDebugTools />
    </div>
  );
}
