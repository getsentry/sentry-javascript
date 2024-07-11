import { A } from '@solidjs/router';

export default function Home() {
  return (
    <>
      <h1>Welcome to Solid Start</h1>
      <p>
        Visit <a href="https://docs.solidjs.com/solid-start">docs.solidjs.com/solid-start</a> to read the documentation
      </p>
      <ul>
        <li>
          <A href="/client-error">Client error</A>
        </li>
      </ul>
    </>
  );
}
