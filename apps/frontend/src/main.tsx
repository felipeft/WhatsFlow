import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/app/router';
import '@/app/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento raiz ausente');

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
