// In dev mode, Next.js compiles a route when it is requested for the first time. On CI this takes about 30 seconds,
// which is as long as the timeout of a test. So both routes are requested here, before the tests start.
export default async function globalSetup() {
  await fetch('http://localhost:3030/');
  await fetch('http://localhost:3030/api/trpc/post.getLatest');
}
