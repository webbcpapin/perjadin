import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  base: '/perjadin/',
  plugins: [react(), {
    name: 'intake-csp',
    apply: 'build',
    transformIndexHtml: () => [{
      tag: 'meta',
      attrs: {
        'http-equiv': 'Content-Security-Policy',
        content: "default-src 'self'; script-src 'self' https://accounts.google.com/gsi/client; style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style; img-src 'self' data:; connect-src 'self' https://accounts.google.com/gsi/ https://script.google.com https://script.googleusercontent.com; frame-src https://accounts.google.com/gsi/; form-action 'none'; object-src 'none'; base-uri 'none'",
      },
      injectTo: 'head-prepend',
    }],
  }],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
