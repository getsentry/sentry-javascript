import { MetaFunction } from '@remix-run/node';

// just like with index page, we will then demonstrate in out e2e tests
// that `sentry-trace` and`babbage` are inhereted and play nicely
// with route - level meta info
export const meta: MetaFunction = ({ matches, params }) => {
  const rootMatch = matches.find(({ id }) => id === 'root')?.meta || [];
  return [...rootMatch, { title: `User: ${params.id}` }];
};

export default function User() {
  return <div>I am a blank page</div>;
}
