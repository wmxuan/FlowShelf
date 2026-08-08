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
    // watch 模式下增量构建不清空 outDir，避免 @crxjs 多轮重建时互相清空产物，
    // 导致 manifest 引用的 JS/CSS/png 间歇性从 dist 消失、Chrome 扩展无法加载。
    emptyOutDir: false,
  },
})
