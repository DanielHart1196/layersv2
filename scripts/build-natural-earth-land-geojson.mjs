#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { feature } from "topojson-client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const WORLD_ATLAS_DIR = path.join(ROOT, "public", "data", "world-atlas");

const INPUT_PATH = path.join(ROOT, ".tmp", "package", "world", "50m.json");
const OUTPUT_PATH = path.join(WORLD_ATLAS_DIR, "land-50m.geojson");

async function main() {
  const raw = await fs.readFile(INPUT_PATH, "utf8");
  const topology = JSON.parse(raw);
  const landObject = topology?.objects?.land;
  if (!landObject) {
    throw new Error("Natural Earth land TopoJSON is missing objects.land");
  }

  const collection = feature(topology, landObject);
  collection.metadata = {
    kind: "visionscartoWorldLand",
    source: "visionscarto-world-atlas/world/50m.json",
    generatedBy: "scripts/build-natural-earth-land-geojson.mjs",
    generatedAt: new Date().toISOString(),
  };

  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(collection)}\n`, "utf8");
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
