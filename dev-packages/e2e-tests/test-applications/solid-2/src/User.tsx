import { useNavigate, useParams } from '@solidjs/router';

export default function User() {
  const params = useParams();
  const navigate = useNavigate();

  return (
    <main>
      <p id="userId">User {params.id}</p>
      <button id="navigateBtn" onClick={() => navigate('/user/6')}>
        User 6
      </button>
    </main>
  );
}
