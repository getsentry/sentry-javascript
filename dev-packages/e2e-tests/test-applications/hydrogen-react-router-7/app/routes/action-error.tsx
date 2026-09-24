export async function action() {
  throw new Error('Action Error');
}

export default function ActionError() {
  return (
    <div>
      <h1>Action Error</h1>
    </div>
  );
}
