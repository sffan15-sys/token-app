import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Standalone single-file build used only to publish a shareable demo artifact.
// Not part of the normal dev/build flow (see vite.config.ts for that).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), viteSingleFile()],
  define: {
    'import.meta.env.VITE_DEMO_MODE': JSON.stringify('true'),
  },
  build: {
    outDir: 'dist-demo',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
  },
})
