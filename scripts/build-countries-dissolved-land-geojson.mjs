import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as topojson from "topojson-client";

const require = createRequire(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// world-atlas land-50m.json is already a dissolved single-polygon landmass —
// no ogr2ogr ST_Union needed.
const topology = require("world-atlas/land-50m.json");
const geojson = topojson.feature(topology, topology.objects.land);

const OUTPUT_PATH = path.join(ROOT_DIR, "public", "data", "world-atlas", "countries-dissolved-land.geojson");
fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(geojson));

const bytes = fs.statSync(OUTPUT_PATH).size;
console.log(`Built countries-dissolved-land.geojson (${(bytes / 1024 / 1024).toFixed(1)} MB) at ${OUTPUT_PATH}`);
