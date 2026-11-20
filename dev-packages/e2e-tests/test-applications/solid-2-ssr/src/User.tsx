import { useParams } from '@solidjs/router';

export default function User() {
  const params = useParams();

  return <p id="userId">User {params.id}</p>;
}
