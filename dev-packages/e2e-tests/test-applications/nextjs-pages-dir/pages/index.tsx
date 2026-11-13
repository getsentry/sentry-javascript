import Link from 'next/link';
import { ClientErrorDebugTools } from '../components/client-error-debug-tools';
import styles from '../components/page.module.css';

export default function Page() {
  return (
    <div className={styles.page}>
      <h2>Page (/)</h2>
      <ClientErrorDebugTools />
      <Link href="/user/5" id="navigation">
        navigate
      </Link>
    </div>
  );
}
