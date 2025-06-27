import type { Route } from './+types/dynamic-param';

export async function loader() {
  await new Promise(resolve => setTimeout(resolve, 500));
  return { data: 'burritos' };
}

export default function DynamicParamPage({ params }: Route.ComponentProps) {
  const { param } = params;

  return (
    <div>
      <h1>Dynamic Parameter Page</h1>
      <p>The parameter value is: {param}</p>
    </div>
  );
}
