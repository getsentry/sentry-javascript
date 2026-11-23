export default async function () {
  if (!process.env.TEST_ENV?.startsWith('dev')) {
    return;
  }

  // Compile the browser and middleware entries before the tests exercise concurrent requests.
  for (const path of ['/isr-test/laptop', '/api/endpoint-behind-middleware', '/api/endpoint-behind-middleware-2']) {
    const response = await fetch(`http://localhost:3030${path}`);
    if (!response.ok) {
      throw new Error(`Next.js readiness request failed for ${path}: ${response.status}`);
    }
    await response.text();
  }
}
