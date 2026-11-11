import path from "node:path"
import react from '@vitejs/plugin-react'
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    proxy: {
      // noble CRM server (its vite dev runs on 5177) — same-origin for /api
      "/api": "http://localhost:5177",
    },
  },
})
