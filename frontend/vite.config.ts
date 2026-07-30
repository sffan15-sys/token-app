import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Allows access via LAN IP and ad-hoc tunnel hostnames (e.g. Cloudflare
    // Quick Tunnel's random *.trycloudflare.com subdomain) for remote
    // access to this single-user local tool. Dev-server-only setting.
    allowedHosts: true,
  },
})
