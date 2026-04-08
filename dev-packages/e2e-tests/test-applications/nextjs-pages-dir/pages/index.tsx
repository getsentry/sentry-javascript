import Link from 'next/link';
import { ClientErrorDebugTools } from '../components/client-error-debug-tools';

export default function Page() {
  return (
    <div>
      <h2>Page (/)</h2>
      <ClientErrorDebugTools />
      <Link href="/user/5" id="navigation">
        navigate
      </Link>
    </div>
  );
}
