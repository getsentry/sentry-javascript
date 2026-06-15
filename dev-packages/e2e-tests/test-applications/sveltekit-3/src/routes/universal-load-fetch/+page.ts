export const load = async ({ fetch }) => {
  const usersRes = await fetch('/api/users');
  const data = await usersRes.json();
  return { users: data.users };
};
