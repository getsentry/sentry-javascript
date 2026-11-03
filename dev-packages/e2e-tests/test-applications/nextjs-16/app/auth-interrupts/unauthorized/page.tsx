import { unauthorized } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function UnauthorizedPage() {
  unauthorized();
}
