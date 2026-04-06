import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const polygonClipping = require("polygon-clipping");

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_PATH = path.join(ROOT_DIR, "public", "data", "external-countries.geojson");
const OUTPUT_PATH = path.join(ROOT_DIR, "public", "data", "world-atlas", "countries-dissolved-land.geojson");

console.log("Reading source...");
const source = JSON.parse(fs.readFileSync(SOURCE_PATH, "utf8"));

console.log(`Unioning ${source.features.length} features...`);

const polys = source.features.flatMap((f) => {
  const g = f.geometry;
  if (!g) return [];
  if (g.type === "Polygon") return [g.coordinates];
  if (g.type === "MultiPolygon") return g.coordinates;
  return [];
});

// Union iteratively in batches to avoid hitting polygon-clipping's queue limit
const BATCH = 10;
let accumulated = [polys[0]];
for (let i = 1; i < polys.length; i += BATCH) {
  const batch = polys.slice(i, i + BATCH);
  accumulated = polygonClipping.union(accumulated, ...batch);
  if (i % 50 === 1) process.stdout.write(`  ${i}/${polys.length}\n`);
}
const unioned = accumulated;

const geojson = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    properties: { name: "Dissolved Countries Land", source: "external-countries.geojson" },
    geometry: { type: "MultiPolygon", coordinates: unioned },
  }],
};

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(geojson));
const bytes = fs.statSync(OUTPUT_PATH).size;
console.log(`Done — ${(bytes / 1024 / 1024).toFixed(1)} MB at ${OUTPUT_PATH}`);
