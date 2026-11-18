import { redirect } from '@remix-run/node';

export const loader = () => {
  return redirect('/server-timing/user/redirected');
};
