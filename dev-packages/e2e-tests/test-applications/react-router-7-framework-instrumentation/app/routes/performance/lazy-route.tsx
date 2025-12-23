export async function loader() {
  // Simulate a slow lazy load
  await new Promise(resolve => setTimeout(resolve, 100));
  return { message: 'Lazy loader data' };
}

export default function LazyRoute() {
  return (
    <div>
      <h1 id="lazy-route-title">Lazy Route</h1>
      <p id="lazy-route-content">This route was lazily loaded</p>
    </div>
  );
}
