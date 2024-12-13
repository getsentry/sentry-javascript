import { A } from '@solidjs/router';

export default function PageRoot(props) {
  return (
    <>
      <nav class="bg-gray-200 text-gray-900 px-4">
        <ul class="flex items-center">
          <li class="py-2 px-4">
            <A href="/" class="no-underline hover:underline">
              Home
            </A>
          </li>
          <li>
            <A href="/error-boundary-example" class="no-underline hover:underline">
              Error Boundary Example
            </A>
          </li>
          <li class="py-2 px-4">
            <A href="/error" class="no-underline hover:underline">
              Error
            </A>
          </li>
        </ul>
      </nav>
      <main>{props.children}</main>
    </>
  );
}
