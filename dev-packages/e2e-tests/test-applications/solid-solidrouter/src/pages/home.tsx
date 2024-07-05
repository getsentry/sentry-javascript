import { A } from '@solidjs/router';
import { createSignal } from 'solid-js';

export default function Home() {
  const [count, setCount] = createSignal(0);

  return (
    <section class="bg-gray-100 text-gray-700 p-8">
      <h1 class="text-2xl font-bold">Home</h1>
      <p class="mt-4">This is the home page.</p>

      <div class="flex items-center space-x-2 mb-4">
        <button class="border rounded-lg px-2 border-gray-900" onClick={() => setCount(count() - 1)}>
          -
        </button>

        <output class="p-10px">Count: {count()}</output>

        <button class="border rounded-lg px-2 border-gray-900" onClick={() => setCount(count() + 1)}>
          +
        </button>
      </div>
      <div class="flex flex-col items-start space-x-2">
        <button
          class="border rounded-lg px-2 mb-2 border-red-500 text-red-500 cursor-pointer"
          id="errorBtn"
          onClick={() => {
            throw new Error('Error thrown from Solid E2E test app');
          }}
        >
          Throw error
        </button>
        <A id="navLink" href="/user/5">
          User 5
        </A>
      </div>
    </section>
  );
}
