import type { Route } from './+types/home';

export function meta({}: Route.MetaArgs) {
  return [
    { title: 'React Router Instrumentation API Test' },
    { name: 'description', content: 'Testing React Router instrumentation API' },
  ];
}

export default function Home() {
  return <div>home</div>;
}
