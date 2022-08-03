import { ActionFunction, json } from '@remix-run/node';
import { useActionData } from '@remix-run/react';

export const action: ActionFunction = async ({ params: { id } }) => {
  if (id === '-1') {
    throw new Error('Error');
  }

  return json({ test: 'test' });
};

export default function ActionJSONResponse() {
  const { test } = useActionData();
  return (
    <div>
      <h1>{test}</h1>
    </div>
  );
}
