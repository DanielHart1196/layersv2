import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CACHE_DIR = path.join(ROOT_DIR, ".cache", "geofabrik", "rwanda");
const PUBLIC_PMTILES_DIR = path.join(ROOT_DIR, "public", "pmtiles");
const PUBLIC_METADATA_DIR = path.join(ROOT_DIR, "public", "data", "transport");
const SOURCE_URL = "https://download.geofabrik.de/africa/rwanda-latest.osm.pbf";
const SOURCE_PATH = path.join(CACHE_DIR, "rwanda-latest.osm.pbf");
const FILTERED_GEOJSONSEQ_PATH = path.join(CACHE_DIR, "rwanda-roads.geojsonseq");
const MBTILES_PATH = path.join(CACHE_DIR, "rwanda-roads.mbtiles");
const TIPPECANOE_TEMP_DIR = path.join(CACHE_DIR, "tippecanoe-tmp");
const TARGET_PATH = path.join(PUBLIC_PMTILES_DIR, "rwanda-roads.pmtiles");
const METADATA_PATH = path.join(PUBLIC_METADATA_DIR, "rwanda-roads.metadata.json");
const TIPPECANOE_PATHS = [
  path.join(ROOT_DIR, ".tmp-tippecanoe", "tippecanoe"),
  path.join(ROOT_DIR, ".tmp-tippecanoe-felt", "tippecanoe"),
];
const PMTILES_PATHS = [
  path.join(ROOT_DIR, ".tmp-go-pmtiles", "pmtiles"),
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function hasCommand(command) {
  const result = spawnSync("sh", ["-lc", `command -v ${command}`], {
    encoding: "utf8",
  });
  return result.status === 0;
}

function findExecutable(command, localPaths = []) {
  for (const localPath of localPaths) {
    if (fs.existsSync(localPath)) {
      return localPath;
    }
  }

  return hasCommand(command) ? command : null;
}

function downloadFile(url, targetPath) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        downloadFile(new URL(response.headers.location, url).toString(), targetPath)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download failed with HTTP ${response.statusCode}`));
        return;
      }

      const tempPath = `${targetPath}.download`;
      const file = fs.createWriteStream(tempPath);
      response.pipe(file);
      file.on("finish", () => {
        file.close(() => {
          fs.renameSync(tempPath, targetPath);
          resolve();
        });
      });
      file.on("error", (error) => {
        fs.rmSync(tempPath, { force: true });
        reject(error);
      });
    });

    request.on("error", reject);
  });
}

function runOgr2ogr(args) {
  const result = spawnSync("ogr2ogr", args, {
    cwd: ROOT_DIR,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: ROOT_DIR,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function writeMetadata() {
  const metadata = {
    id: "rwanda-roads",
    label: "Rwanda Roads",
    source: {
      provider: "Geofabrik",
      url: SOURCE_URL,
      format: "OpenStreetMap PBF extract",
    },
    output: {
      path: "/pmtiles/rwanda-roads.pmtiles",
      sourceLayer: "roads",
      format: "PMTiles vector archive",
    },
    filters: {
      osmLayer: "lines",
      include: "highway IS NOT NULL",
      excludeHighwayValues: ["construction", "proposed", "raceway", "services"],
    },
    fields: ["osm_id", "name", "highway", "z_order", "other_tags", "road_class"],
    attribution: "OpenStreetMap contributors; Geofabrik extract",
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(METADATA_PATH, `${JSON.stringify(metadata, null, 2)}\n`);
}

if (!hasCommand("ogr2ogr")) {
  fail("Missing required PMTiles generator: ogr2ogr (GDAL)");
}

const tippecanoeCommand = findExecutable("tippecanoe", TIPPECANOE_PATHS);
if (!tippecanoeCommand) {
  fail("Missing required vector tile generator: tippecanoe");
}

const pmtilesCommand = findExecutable("pmtiles", PMTILES_PATHS);
if (!pmtilesCommand) {
  fail("Missing required PMTiles converter: pmtiles");
}

ensureDirectory(CACHE_DIR);
ensureDirectory(PUBLIC_PMTILES_DIR);
ensureDirectory(PUBLIC_METADATA_DIR);
ensureDirectory(TIPPECANOE_TEMP_DIR);

if (!fs.existsSync(SOURCE_PATH)) {
  console.log(`Downloading ${SOURCE_URL}`);
  await downloadFile(SOURCE_URL, SOURCE_PATH);
} else {
  console.log(`Using cached source ${SOURCE_PATH}`);
}

fs.rmSync(TARGET_PATH, { force: true });
fs.rmSync(`${TARGET_PATH}.tmp.mbtiles`, { force: true });
fs.rmSync(FILTERED_GEOJSONSEQ_PATH, { force: true });
fs.rmSync(MBTILES_PATH, { force: true });

const roadSql = `
  SELECT
    osm_id,
    name,
    highway,
    z_order,
    other_tags,
    CASE
      WHEN highway IN ('motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link') THEN 'major'
      WHEN highway IN ('secondary', 'secondary_link', 'tertiary', 'tertiary_link') THEN 'secondary'
      WHEN highway IN ('residential', 'unclassified', 'living_street', 'service') THEN 'local'
      WHEN highway IN ('track', 'path', 'footway', 'cycleway', 'bridleway', 'steps', 'pedestrian') THEN 'path'
      ELSE 'other'
    END AS road_class,
    geometry
  FROM lines
  WHERE highway IS NOT NULL
    AND highway NOT IN ('construction', 'proposed', 'raceway', 'services')
`;

runOgr2ogr([
  "-f",
  "GeoJSONSeq",
  FILTERED_GEOJSONSEQ_PATH,
  SOURCE_PATH,
  "-overwrite",
  "-progress",
  "-dialect",
  "SQLITE",
  "-sql",
  roadSql,
  "-nln",
  "roads",
  "-lco",
  "RS=NO",
  "--config",
  "GDAL_NUM_THREADS",
  "ALL_CPUS",
]);

runCommand(tippecanoeCommand, [
  "--output",
  MBTILES_PATH,
  "--force",
  "--layer",
  "roads",
  "--minimum-zoom",
  "6",
  "--maximum-zoom",
  "14",
  "--full-detail",
  "12",
  "--low-detail",
  "10",
  "--minimum-detail",
  "8",
  "--buffer",
  "8",
  "--drop-densest-as-needed",
  "--extend-zooms-if-still-dropping",
  "--read-parallel",
  "--temporary-directory",
  TIPPECANOE_TEMP_DIR,
  "--name",
  "Rwanda Roads",
  "--description",
  "Rwanda OSM roads, tracks, and paths from Geofabrik",
  "--attribution",
  "OpenStreetMap contributors; Geofabrik extract",
  FILTERED_GEOJSONSEQ_PATH,
]);

runCommand(pmtilesCommand, [
  "convert",
  MBTILES_PATH,
  TARGET_PATH,
]);

writeMetadata();

console.log(`Built ${TARGET_PATH}`);
console.log(`Wrote ${METADATA_PATH}`);
