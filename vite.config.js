import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 8100,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 8100,
    strictPort: true,
  },
  base: "./",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
      },
    },
  },
  optimizeDeps: {
    include: ["maplibre-gl", "shpjs"],
    force: true,
  },
});
