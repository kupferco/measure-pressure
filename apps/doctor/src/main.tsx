import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './auth';
import './theme.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/*
      Deployed under /doctor, so the router has to know it is not at the root.
      The trailing slash is stripped: BASE_URL is "/doctor/", and with that as the
      basename React Router refuses to match the URL "/doctor" - which is exactly
      what people type - and renders nothing at all.
    */}
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
