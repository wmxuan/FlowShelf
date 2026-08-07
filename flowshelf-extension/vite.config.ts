import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { crx } from "@crxjs/vite-plugin"
import { readFileSync } from "node:fs"

const manifest = JSON.parse(readFileSync("./manifest.json", "utf-8"))

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      "@": new URL("./src/", import.meta.url).pathname,
    },
  },
  server: {
    port: 5173,
    hmr: {
      port: 5174,
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
})
