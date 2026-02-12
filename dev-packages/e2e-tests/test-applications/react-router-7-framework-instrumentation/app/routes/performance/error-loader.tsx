export function loader(): never {
  throw new Error('Loader error for testing');
}

export default function ErrorLoaderPage() {
  return (
    <div>
      <h1>Error Loader Page</h1>
      <p>This should not render</p>
    </div>
  );
}
