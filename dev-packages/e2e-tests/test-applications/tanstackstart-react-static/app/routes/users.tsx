import { Outlet, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/users')({
  component: UsersLayout,
});

function UsersLayout() {
  return (
    <div>
      <Outlet />
    </div>
  );
}
