import { requireSupabase } from "../lib/supabase.js";

const BATCH_SIZE = 500;

function slugifySegment(value, fallback = "layer") {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

function sanitizeFileBaseName(filename, fallback = "file") {
  const withoutExtension = String(filename ?? "").replace(/\.[^.]+$/, "");
  const normalized = withoutExtension
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || fallback;
}

function sanitizeExtension(filename, fallback = "bin") {
  const match = /\.([^.]+)$/.exec(String(filename ?? "").trim());
  const normalized = match?.[1]?.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return normalized || fallback;
}

function buildUploadTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

// Creates a layer row, stores files, and inserts all features in batches.
// onProgress(pct, label) called throughout to report progress.
export async function insertLayer({ name, viewAccess, features, fieldSchema = [], rawFile, usePmtiles, onProgress }) {
  const supabase = requireSupabase();
  // 1. Detect geometry type from features
  const types = new Set(features.map((f) => f.geometry?.type));
  const geometryType = types.size > 1 ? "mixed"
    : types.has("Point") ? "point"
    : types.has("LineString") || types.has("MultiLineString") ? "line"
    : "polygon";

  // 2. Generate PMTiles if requested (progress 0-40%)
  let pmtilesBuffer = null;
  if (usePmtiles) {
    onProgress?.(0, "Generating tiles…");
    const geojson = {
      type: "FeatureCollection",
      features: features.map((f) => ({ type: "Feature", geometry: f.geometry, properties: f.properties })),
    };
    pmtilesBuffer = await generatePmtilesInWorker(geojson, (pct) => {
      onProgress?.(Math.round(pct * 0.4), "Generating tiles…");
    });
  }

  // 3. Create the layer row (progress ~45%)
  onProgress?.(usePmtiles ? 42 : 5, "Creating layer…");
  const layerInsert = {
    name,
    view_access: viewAccess,
    geometry_type: geometryType,
    default_style: defaultStyleForType(geometryType),
    field_schema: Array.isArray(fieldSchema) ? fieldSchema : [],
  };
  let { data: layer, error: layerError } = await supabase
    .from("layers")
    .insert(layerInsert)
    .select("id")
    .single();

  if (layerError && /field_schema/i.test(layerError.message ?? "")) {
    const retry = await supabase
      .from("layers")
      .insert({
        name,
        view_access: viewAccess,
        geometry_type: geometryType,
        default_style: defaultStyleForType(geometryType),
      })
      .select("id")
      .single();
    layer = retry.data;
    layerError = retry.error;
  }

  if (layerError) throw new Error(`Failed to create layer: ${layerError.message}`);
  const layerId = layer.id;
  const folderName = `${slugifySegment(name, "layer")}_${layerId}`;
  const uploadTimestamp = buildUploadTimestamp();
  const originalBaseName = sanitizeFileBaseName(rawFile?.name, "upload");
  const rawFileExt = sanitizeExtension(rawFile?.name, "bin");
  const rawStoragePath = rawFile
    ? `${folderName}/${originalBaseName}_${uploadTimestamp}.${rawFileExt}`
    : null;
  const pmtilesStoragePath = `${folderName}/${originalBaseName}_${uploadTimestamp}.pmtiles`;

  // 4. Upload raw file to storage (progress ~50%)
  if (rawFile && rawStoragePath) {
    onProgress?.(usePmtiles ? 45 : 8, "Storing original file…");
    const { error: rawError } = await supabase.storage
      .from("layer-files")
      .upload(rawStoragePath, rawFile, { contentType: rawFile.type || "application/octet-stream" });

    if (rawError) {
      await supabase.from("layers").delete().eq("id", layerId);
      throw new Error(`Failed to store file: ${rawError.message}`);
    }

    const { data: rawUrl } = supabase.storage.from("layer-files").getPublicUrl(rawStoragePath);
    await supabase.from("layers").update({ file_url: rawUrl.publicUrl }).eq("id", layerId);
  }

  // 5. Upload PMTiles to storage (progress ~60%)
  if (pmtilesBuffer) {
    onProgress?.(52, "Storing tiles…");
    const { error: tilesError } = await supabase.storage
      .from("layer-files")
      .upload(pmtilesStoragePath, pmtilesBuffer, { contentType: "application/x-protobuf" });

    if (tilesError) {
      await supabase.from("layers").delete().eq("id", layerId);
      throw new Error(`Failed to store tiles: ${tilesError.message}`);
    }

    const { data: tilesUrl } = supabase.storage.from("layer-files").getPublicUrl(pmtilesStoragePath);
    await supabase.from("layers").update({ tiles_url: tilesUrl.publicUrl }).eq("id", layerId);
  }

  // 6. Insert features in batches (progress 60-100%)
  const rows = features.map((f) => ({
    layer_id: layerId,
    geometry: f.geometry,
    properties: f.properties ?? {},
    valid_from: f.valid_from || null,
    valid_to:   f.valid_to   || null,
  }));

  const total = rows.length;
  let inserted = 0;
  const progressStart = usePmtiles ? 62 : 12;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("features").insert(batch);
    if (error) {
      await supabase.from("layers").delete().eq("id", layerId);
      throw new Error(`Failed to insert features: ${error.message}`);
    }
    inserted += batch.length;
    const pct = progressStart + Math.round((inserted / total) * (100 - progressStart));
    onProgress?.(pct, `Uploading features… ${inserted.toLocaleString()} / ${total.toLocaleString()}`);
  }

  return layerId;
}

// ── PMTiles worker ────────────────────────────────────────────────────────────

function generatePmtilesInWorker(geojson, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./pmtiles-worker.js", import.meta.url), { type: "module" });

    worker.onmessage = ({ data }) => {
      if (data.type === "progress") {
        onProgress?.(data.pct);
      } else if (data.type === "done") {
        worker.terminate();
        resolve(new Uint8Array(data.buffer));
      } else if (data.type === "error") {
        worker.terminate();
        reject(new Error(data.message));
      }
    };

    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(`Tile generation failed: ${e.message}`));
    };

    worker.postMessage({ geojson });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function defaultStyleForType(type) {
  if (type === "point")   return { renderType: "point",   color: "#e74c3c", opacity: 80, radius: 6 };
  if (type === "line")    return { renderType: "line",    color: "#3498db", opacity: 90, weight: 2 };
  if (type === "polygon") return { renderType: "polygon", color: "#2ecc71", opacity: 60 };
  return                         { renderType: "point",   color: "#e74c3c", opacity: 80, radius: 6 };
}
