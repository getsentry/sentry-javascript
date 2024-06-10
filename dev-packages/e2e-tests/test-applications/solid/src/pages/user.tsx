import { useParams } from '@solidjs/router';

export default function User() {
  const params = useParams();
  return <div>User ID: {params.id}</div>;
}
