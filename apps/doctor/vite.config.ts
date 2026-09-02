import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Belt and braces against the npm-workspaces failure mode: if a second copy of
    // React is ever installed under this app, every hook throws "Invalid hook
    // call" and the message blames your components rather than the install.
    // Pinning the versions prevents it; this makes sure a drift cannot resurrect it.
    dedupe: ['react', 'react-dom'],
  },
  // Served under /doctor by the API in the deployed environments, so assets have
  // to be requested from there rather than from the root the patient app owns.
  base: '/doctor/',
  server: {
    port: 5174,
    // The API is a separate origin in development. Proxying keeps requests
    // same-origin, which means the session cookie works exactly as it does in
    // production instead of needing a second, cookie-less code path.
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL ?? 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
});
