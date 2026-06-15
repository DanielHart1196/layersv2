import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ENV_PATHS = [path.join(ROOT_DIR, ".env.local"), path.join(ROOT_DIR, ".env")];
const PMTILES_PATH = path.join(ROOT_DIR, "public", "pmtiles", "rwanda-roads.pmtiles");
const STORAGE_BUCKET = "layer-files";
const STORAGE_PATH = "catalog/rwanda-roads/rwanda-roads.pmtiles";
const LAYER_NAME = "Rwanda Roads";
const DATASET_NAME = "Rwanda Roads";
const SOURCE_LAYER = "roads";
const FEATURE_COUNT = 172_439;
const BOUNDS = [28.855365, -2.866518, 30.896814, -0.979432];
const FIELD_SCHEMA = [
  { key: "osm_id", label: "OSM ID", type: "text", required: false, visible: true, sortable: true, filterable: true },
  { key: "name", label: "Name", type: "text", required: false, visible: true, sortable: true, filterable: true },
  { key: "highway", label: "Highway", type: "text", required: false, visible: true, sortable: true, filterable: true },
  { key: "road_class", label: "Road Class", type: "text", required: false, visible: true, sortable: true, filterable: true },
  { key: "z_order", label: "Z Order", type: "number", required: false, visible: true, sortable: true, filterable: true },
  { key: "other_tags", label: "Other Tags", type: "text", required: false, visible: true, sortable: true, filterable: true },
];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      continue;
    }
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) {
      continue;
    }
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

function requireEnv(name) {
  const value = String(process.env[name] ?? "").trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function getExistingLayer(supabase) {
  const { data, error } = await supabase
    .from("layers")
    .select("id, name")
    .eq("name", LAYER_NAME)
    .in("view_access", ["public", "unlisted"])
    .limit(1);

  if (error) {
    throw new Error(`Failed to check existing layer: ${error.message}`);
  }

  return Array.isArray(data) ? data[0] ?? null : null;
}

async function ensureStorageObject(supabase) {
  const body = fs.readFileSync(PMTILES_PATH);
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(STORAGE_PATH, body, {
      contentType: "application/vnd.pmtiles",
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload PMTiles: ${error.message}`);
  }

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(STORAGE_PATH);
  const publicUrl = String(data?.publicUrl ?? "").trim();
  if (!publicUrl) {
    throw new Error("Failed to resolve public PMTiles URL.");
  }
  return publicUrl;
}

async function ensureLayer(supabase) {
  const existing = await getExistingLayer(supabase);
  if (existing?.id) {
    return { layerId: existing.id, created: false };
  }

  const { data, error } = await supabase
    .from("layers")
    .insert({
      name: LAYER_NAME,
      view_access: "public",
      submit_access: "closed",
      geometry_type: "line",
      geometry_types: ["line"],
      feature_count: FEATURE_COUNT,
      default_style: {
        renderType: "line",
        color: "#C46A2E",
        opacity: 90,
        weight: 1.2,
      },
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create layer: ${error.message}`);
  }

  return { layerId: data.id, created: true };
}

async function hasDataset(supabase, layerId) {
  const { data, error } = await supabase
    .from("datasets")
    .select("id")
    .eq("layer_id", layerId)
    .eq("name", DATASET_NAME)
    .eq("render_format", "pmtiles")
    .limit(1);

  if (error) {
    throw new Error(`Failed to check existing dataset: ${error.message}`);
  }

  return Boolean(Array.isArray(data) && data[0]?.id);
}

async function insertDataset(supabase, layerId, artifactUrl) {
  const { data, error } = await supabase
    .from("datasets")
    .insert({
      layer_id: layerId,
      name: DATASET_NAME,
      license: "ODbL 1.0",
      license_url: "https://www.openstreetmap.org/copyright",
      attribution: "OpenStreetMap contributors; Geofabrik extract",
      geometry_type: "line",
      geometry_types: ["line"],
      field_schema: FIELD_SCHEMA,
      render_format: "pmtiles",
      artifact_url: artifactUrl,
      source_layer: SOURCE_LAYER,
      minzoom: 6,
      maxzoom: 14,
      bounds: BOUNDS,
      artifact_metadata: {
        source: {
          provider: "Geofabrik",
          url: "https://download.geofabrik.de/africa/rwanda-latest.osm.pbf",
          format: "OpenStreetMap PBF extract",
        },
        vector_layers: [{
          id: SOURCE_LAYER,
          minzoom: 6,
          maxzoom: 14,
          fields: Object.fromEntries(FIELD_SCHEMA.map((field) => [field.key, field.type === "number" ? "Number" : "String"])),
        }],
      },
      feature_count: FEATURE_COUNT,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create dataset: ${error.message}`);
  }

  return data.id;
}

for (const envPath of ENV_PATHS) {
  loadEnvFile(envPath);
}

if (!fs.existsSync(PMTILES_PATH)) {
  fail(`Missing PMTiles artifact. Run npm run build:transport:roads:rwanda first: ${PMTILES_PATH}`);
}

const supabaseUrl = requireEnv("VITE_SUPABASE_URL");
const supabaseAnonKey = requireEnv("VITE_SUPABASE_ANON_KEY");
const supabase = createClient(supabaseUrl, supabaseAnonKey);

try {
  const artifactUrl = await ensureStorageObject(supabase);
  const { layerId, created } = await ensureLayer(supabase);
  let datasetId = null;
  if (!(await hasDataset(supabase, layerId))) {
    datasetId = await insertDataset(supabase, layerId, artifactUrl);
  }

  console.log(JSON.stringify({
    ok: true,
    layerId,
    layerCreated: created,
    datasetId,
    artifactUrl,
  }, null, 2));
} catch (error) {
  fail(error?.message ?? "Failed to register Rwanda roads.");
}
