import { useNavigate } from 'react-router';

export default function SsrPage() {
  const navigate = useNavigate();

  return (
    <div>
      <h1>SSR Page</h1>
      <button type="button" onClick={() => navigate(-1)}>
        History Back Navigate
      </button>
    </div>
  );
}
