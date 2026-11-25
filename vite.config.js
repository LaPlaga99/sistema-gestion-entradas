import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/sistema-gestion-entradas/',
  plugins: [tailwindcss()],
  build: {
    outDir: 'dist',
    sourcemap: false
  }
});