import { forbidden } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function ForbiddenPage() {
  forbidden();
}
