import { resolve } from "node:path";
import { defineConfig } from "vite";
import cesium from "vite-plugin-cesium";

export default defineConfig({
  plugins: [cesium()],
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
        v3: resolve(__dirname, "v3.html"),
        cesium: resolve(__dirname, "cesium.html"),
        earthlab: resolve(__dirname, "earthlab/index.html"),
      },
    },
  },
  optimizeDeps: {
    include: [
      "maplibre-gl",
      "shpjs",
      "@deck.gl/core",
      "@deck.gl/layers",
      "@deck.gl/mapbox",
      "@deck.gl/geo-layers",
    ],
    force: true,
  },
});
