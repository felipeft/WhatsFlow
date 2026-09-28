import { Outlet } from 'react-router-dom';

export function AppLayout() {
  return (
    <main aria-label="WhatsFlow">
      <Outlet />
    </main>
  );
}
