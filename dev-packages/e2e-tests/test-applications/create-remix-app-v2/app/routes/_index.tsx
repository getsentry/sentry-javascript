import { Link } from '@remix-run/react';

export default function Index() {
  return (
    <div>
      <input
        type="button"
        value="Capture Exception"
        id="exception-button"
        onClick={() => {
          throw new Error('I am an error!');
        }}
      />
      <Link to="/user/5" id="navigation">
        navigate
      </Link>
    </div>
  );
}
