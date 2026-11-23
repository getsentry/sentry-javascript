export default async function () {
  if (!process.env.TEST_ENV?.startsWith('dev')) {
    return;
  }

  // Compile the browser entry before concurrent tests compete with edge-route initialization.
  const response = await fetch('http://localhost:3030/isr-test/laptop');
  if (!response.ok) {
    throw new Error(`Next.js readiness request failed: ${response.status}`);
  }
  await response.text();
}
