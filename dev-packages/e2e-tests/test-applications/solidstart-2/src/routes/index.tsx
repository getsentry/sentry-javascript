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
        <li>
          <A href="/server-error">Server error</A>
        </li>
        <li>
          <A href="/error-boundary">Error Boundary</A>
        </li>
        <li>
          <A id="navLink" href="/users/5">
            User 5
          </A>
        </li>
        <li>
          <A href="/back-navigation">Test back navigation</A>
        </li>
      </ul>
    </>
  );
}
