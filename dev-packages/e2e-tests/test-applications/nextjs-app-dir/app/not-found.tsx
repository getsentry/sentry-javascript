import { ClientErrorDebugTools } from '../components/client-error-debug-tools';

export default function NotFound() {
  return (
    <div style={{ border: '1px solid lightgrey', padding: '12px' }}>
      <h2>Not found (/)</h2>;
      <ClientErrorDebugTools />
    </div>
  );
}
