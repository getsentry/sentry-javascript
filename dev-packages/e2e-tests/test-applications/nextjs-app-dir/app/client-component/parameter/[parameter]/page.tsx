import { ClientErrorDebugTools } from '../../../../components/client-error-debug-tools';

export default function Page({ params }: { params: Record<string, string> }) {
  return (
    <div style={{ border: '1px solid lightgrey', padding: '12px' }}>
      <h2>Page (/client-component/[parameter])</h2>
      <p>Parameter: {JSON.stringify(params['parameter'])}</p>
      <ClientErrorDebugTools />
    </div>
  );
}

export async function generateStaticParams() {
  return [{ parameter: '42' }];
}
