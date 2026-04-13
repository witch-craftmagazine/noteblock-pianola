// vite.config.js
import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  base: '/noteblock-pianola/',   // 👈 REQUIRED for GitHub Pages
  server: { port: 8000 },
  assetsInclude: ['**/*.sf2', '**/*.mid', '**/*.glb'],
})