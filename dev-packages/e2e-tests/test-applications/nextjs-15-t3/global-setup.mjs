// `next dev` compiles a route on its first request. On CI, the compile of both routes takes about as long as the
// test timeout, so the first test would pay for it.
export default async function globalSetup() {
  await fetch('http://localhost:3030/');
  await fetch('http://localhost:3030/api/trpc/post.getLatest');
}
