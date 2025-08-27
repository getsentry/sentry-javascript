export const load = async ({ fetch }) => {
  const res = await fetch('/api/users');
  const data = await res.json();
  return { data };
};
