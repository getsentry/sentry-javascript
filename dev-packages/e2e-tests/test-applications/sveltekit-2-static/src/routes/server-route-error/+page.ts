export const load = async ({ fetch }) => {
  const res = await fetch('/server-route-error');
  const data = await res.json();
  return {
    msg: data,
  };
};
