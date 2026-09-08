import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Same guard as the other two apps: a second copy of React under this
    // workspace would break every hook and blame the components.
    dedupe: ['react', 'react-dom'],
  },
  // The landing page owns the root of its own Hosting site (measurepressure.web.app),
  // so no base path. The app lives on a different origin entirely - see firebase.json.
  server: {
    port: 5175,
  },
});
