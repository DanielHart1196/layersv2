import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(projectRoot, "..");

const sourcePath = path.join(repoRoot, "data", "temporal", "olympic-medals-birthplace.layer.json");
const outputDir = path.join(projectRoot, "public", "data", "temporal");
function getFeatureCollectionForTime(layerArtifact, time) {
  const featureCollection = layerArtifact.featuresByTime?.[String(time)]
    ?? layerArtifact.featuresByTime?.[time];
  if (!featureCollection || featureCollection.type !== "FeatureCollection") {
    throw new Error(`Olympics layer artifact is missing a FeatureCollection for time ${time}.`);
  }

  return featureCollection;
}

const sourceRaw = await fs.readFile(sourcePath, "utf8");
const layerArtifact = JSON.parse(sourceRaw);
const availableTimes = Array.isArray(layerArtifact?.availableTimes) ? layerArtifact.availableTimes : [];
if (!availableTimes.length) {
  throw new Error("Olympics layer artifact has no availableTimes.");
}

await fs.mkdir(outputDir, { recursive: true });

for (const time of availableTimes) {
  const outputPath = path.join(outputDir, `olympic-medals-birthplace.${time}.geojson`);
  const featureCollection = getFeatureCollectionForTime(layerArtifact, time);
  await fs.writeFile(outputPath, `${JSON.stringify(featureCollection)}\n`, "utf8");
  console.log(`Built ${path.relative(projectRoot, outputPath)}.`);
}
