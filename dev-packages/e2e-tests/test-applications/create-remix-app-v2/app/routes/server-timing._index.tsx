import { Link } from '@remix-run/react';

export default function ServerTimingIndex() {
  return (
    <Link id="navigation" to="/server-timing/user/123">
      Navigate to User 123
    </Link>
  );
}
