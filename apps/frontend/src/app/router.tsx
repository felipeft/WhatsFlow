import { createBrowserRouter } from 'react-router-dom';
import { AppLayout } from '@/components/app-layout';

export const router = createBrowserRouter([
  { path: '/', element: <AppLayout /> },
]);
