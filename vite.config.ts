import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Relative asset paths, so the built site works from any address: a GitHub Pages
  // subfolder such as /vessel-studio-3d/, another host, or a custom domain.
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      output: {
        // three.js in its own file, so a new version of the app reloads only its own code. React and the libraries
        // built on it stay together: split across files, React's parts ran in the wrong order and the page crashed
        // ("Cannot set properties of undefined (setting 'Activity')").
        manualChunks: id => (/node_modules\/(three|three-mesh-bvh)\//.test(id) ? 'three' : undefined),
      },
    },
    // three.js is one module of about 750 kB with its BVH, and the app with React about 600 kB; the limit sits just above.
    chunkSizeWarningLimit: 800,
  },
  test: {
    environment: 'node',
    exclude: ['node_modules/**', 'dist/**', 'local/**'],
    // The runner test waits on the worker's real 16 ms batch timers: 4.3 s on Gil's Mac, 6.6 s on GitHub's runner, past
    // Vitest's 5 s default. The rest take under 2.5 s.
    testTimeout: 30_000,
  },
})
