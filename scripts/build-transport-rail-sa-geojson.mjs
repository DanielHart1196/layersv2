import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = process.cwd();
const ZIP_PATH = path.join(ROOT_DIR, ".tmp", "transport", "Railways_geojson.zip");
const OUTPUT_DIR = path.join(ROOT_DIR, "public", "data", "transport");
const OUTPUT_PATH = path.join(OUTPUT_DIR, "rail-sa.geojson");
const ZIP_MEMBER = "Railways_GDA2020.geojson";

mkdirSync(OUTPUT_DIR, { recursive: true });

const buffer = execFileSync("unzip", ["-p", ZIP_PATH, ZIP_MEMBER], {
  encoding: "buffer",
  maxBuffer: 32 * 1024 * 1024,
});

writeFileSync(OUTPUT_PATH, buffer);

console.log(`Wrote ${OUTPUT_PATH}`);
