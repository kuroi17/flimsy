import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { flimsy } from 'flimsy/vite';

export default defineConfig({
  plugins: [
    flimsy(),
    react(),
  ],
  server: {
    port: 5173,
  },
});

