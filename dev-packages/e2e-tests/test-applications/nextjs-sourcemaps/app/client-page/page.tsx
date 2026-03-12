'use client';

function getGreeting(name: string): string {
  return `Hello, ${name}! Welcome to the sourcemap test app.`;
}

export default function ClientPage() {
  const greeting = getGreeting('World');
  return (
    <div>
      <h1>{greeting}</h1>
      <button
        onClick={() => {
          throw new Error('Test error from client page');
        }}
      >
        Throw Error
      </button>
    </div>
  );
}
