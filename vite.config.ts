import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH lo define el flujo de GitHub Actions (p. ej. "/RedCity/") para publicar en GitHub Pages.
// En local queda en "/".
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
});
