import { ClientErrorDebugTools } from '../../../../components/client-error-debug-tools';

export default function Page({ params }: { params: Record<string, string> }) {
  return (
    <div style={{ border: '1px solid lightgrey', padding: '12px' }}>
      <h2>Page (/client-component/[...parameters])</h2>
      <p>Params: {JSON.stringify(params['parameters'])}</p>
      <ClientErrorDebugTools />
    </div>
  );
}

export async function generateStaticParams() {
  return [{ parameters: ['foo', 'bar', 'baz'] }];
}
