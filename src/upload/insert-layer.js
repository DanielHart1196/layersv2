import { requireSupabase } from "../lib/supabase.js";
import { inferGeometryFamily } from "./geometry-family.js";

const BATCH_SIZE = 500;

function extractErrorStatus(error) {
  if (!error || typeof error !== "object") return null;
  return error.status ?? error.statusCode ?? error.code ?? null;
}

function formatUploadError(stage, error, context = {}) {
  const rawMessage = String(error?.message ?? error ?? "Unknown error");
  const normalized = rawMessage.toLowerCase();
  const status = extractErrorStatus(error);
  const batchLabel = context.batchLabel ? ` (${context.batchLabel})` : "";

  if (status === 502 || normalized.includes("bad gateway")) {
    return `${stage}${batchLabel} failed because Supabase returned 502 Bad Gateway while writing data. The upload likely reached the server but timed out or overloaded during feature insertion. Try a smaller file or retry in a moment.`;
  }

  if (
    normalized.includes("failed to fetch")
    || normalized.includes("err_failed")
    || normalized.includes("err_name_not_resolved")
    || normalized.includes("networkerror")
  ) {
    return `${stage}${batchLabel} failed because the app lost connection to Supabase while writing data. Check your network and retry.`;
  }

  if (normalized.includes("cors")) {
    return `${stage}${batchLabel} failed because the browser could not complete the Supabase request. This often appears as a CORS error when the upstream request already failed. ${rawMessage}`;
  }

  return `${stage}${batchLabel} failed. ${rawMessage}`;
}

async function cleanupPartialUpload(supabase, { datasetId, layerId }) {
  const issues = [];

  if (datasetId) {
    const { error } = await supabase.from("datasets").delete().eq("id", datasetId);
    if (error) {
      issues.push(`dataset cleanup failed: ${error.message}`);
    }
  }

  if (layerId) {
    const { error } = await supabase.from("layers").delete().eq("id", layerId);
    if (error) {
      issues.push(`layer cleanup failed: ${error.message}`);
    }
  }

  return issues;
}

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

function buildUploadTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function inferGeometryType(features = []) {
  return inferGeometryFamily(features);
}

function mergeLayerGeometryType(currentType, nextType) {
  if (!currentType) return nextType;
  if (!nextType) return currentType;
  if (currentType === "mixed" || nextType === "mixed") return "mixed";
  if (currentType === nextType) return currentType;
  return "mixed";
}

function defaultStyleForType(type) {
  if (type === "point") return { renderType: "point", color: "#e74c3c", opacity: 80, radius: 6 };
  if (type === "line") return { renderType: "line", color: "#3498db", opacity: 90, weight: 2 };
  if (type === "polygon") return { renderType: "polygon", color: "#2ecc71", opacity: 60 };
  return { renderType: "point", color: "#e74c3c", opacity: 80, radius: 6 };
}

function buildStorageInfo({ layerId, datasetId, rawFile, datasetName }) {
  const layerFolder = `${slugifySegment(datasetName, "layer")}_${layerId}`;
  const originalBaseName = sanitizeFileBaseName(rawFile?.name ?? datasetName, "upload");
  const uploadTimestamp = buildUploadTimestamp();
  const datasetFolder = `${layerFolder}/${datasetId}`;

  return {
    geojsonStoragePath: `${datasetFolder}/${originalBaseName}_${uploadTimestamp}.geojson`,
    pmtilesStoragePath: `${datasetFolder}/${originalBaseName}_${uploadTimestamp}.pmtiles`,
  };
}

function makeFeatureRows(datasetId, features) {
  return features.map((feature) => ({
    dataset_id: datasetId,
    geometry: feature.geometry,
    properties: feature.properties ?? {},
    valid_from: feature.valid_from || null,
    valid_to: feature.valid_to || null,
  }));
}

async function insertFeatureBatches(supabase, datasetId, features, { onProgress, progressStart = 0, progressEnd = 100 } = {}) {
  const rows = makeFeatureRows(datasetId, features);
  const total = rows.length;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("features").insert(batch);
    if (error) {
      const batchStart = i + 1;
      const batchEnd = i + batch.length;
      throw new Error(formatUploadError("Feature upload", error, {
        batchLabel: `${batchStart.toLocaleString()}-${batchEnd.toLocaleString()} of ${total.toLocaleString()} features`,
      }));
    }
    inserted += batch.length;
    const pct = progressStart + Math.round((inserted / total) * (progressEnd - progressStart));
    onProgress?.(pct, `Uploading features... ${inserted.toLocaleString()} / ${total.toLocaleString()}`);
  }

  return inserted;
}

function generatePmtilesInWorker(geojson, onProgress) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./pmtiles-worker.js", import.meta.url), { type: "module" });

    worker.onmessage = ({ data }) => {
      if (data.type === "progress") {
        onProgress?.(data.pct);
      } else if (data.type === "done") {
        worker.terminate();
        resolve({
          buffer: new Uint8Array(data.buffer),
          diagnostics: data.diagnostics ?? null,
        });
      } else if (data.type === "error") {
        worker.terminate();
        reject(new Error(data.message));
      }
    };

    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(`Tile generation failed: ${event.message}`));
    };

    worker.postMessage({ geojson });
  });
}

function buildFeatureCollection(features) {
  return {
    type: "FeatureCollection",
    features: features.map((feature) => ({
      type: "Feature",
      geometry: feature.geometry,
      properties: feature.properties ?? {},
    })),
  };
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSeconds(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "0.0s";
  return `${(ms / 1000).toFixed(1)}s`;
}

function buildPmtilesDiagnosticsLabel(diagnostics) {
  if (!diagnostics) return "";

  const parts = [];
  if (Number.isFinite(diagnostics.tileCount)) {
    parts.push(`${diagnostics.tileCount.toLocaleString()} tiles`);
  }
  if (Number.isFinite(diagnostics.sizeBytes)) {
    parts.push(formatBytes(diagnostics.sizeBytes));
  }
  if (Number.isFinite(diagnostics.timingsMs?.total)) {
    parts.push(`gen ${formatSeconds(diagnostics.timingsMs.total)}`);
  }

  return parts.length ? ` (${parts.join(" · ")})` : "";
}

async function uploadDatasetArtifact(
  supabase,
  { layerId, datasetId, layerName, rawFile, artifactFormat, geojsonText, pmtilesBuffer, pmtilesDiagnostics, onProgress, progressOffset },
) {
  const { geojsonStoragePath, pmtilesStoragePath } = buildStorageInfo({ layerId, datasetId, rawFile, datasetName: layerName });
  const patch = { render_format: artifactFormat };

  if (artifactFormat === "pmtiles") {
    onProgress?.(progressOffset, `Storing PMTiles...${buildPmtilesDiagnosticsLabel(pmtilesDiagnostics)}`);
    const { error: tilesError } = await supabase.storage
      .from("layer-files")
      .upload(pmtilesStoragePath, pmtilesBuffer, { contentType: "application/x-protobuf" });

    if (tilesError) {
      throw new Error(`Failed to store tiles: ${tilesError.message}`);
    }

    const { data: tilesUrl } = supabase.storage.from("layer-files").getPublicUrl(pmtilesStoragePath);
    patch.artifact_url = tilesUrl.publicUrl;
  } else {
    onProgress?.(progressOffset, "Storing GeoJSON...");
    const { error: geojsonError } = await supabase.storage
      .from("layer-files")
      .upload(geojsonStoragePath, new Blob([geojsonText], { type: "application/geo+json" }), { contentType: "application/geo+json" });

    if (geojsonError) {
      throw new Error(`Failed to store GeoJSON: ${geojsonError.message}`);
    }

    const { data: geojsonUrl } = supabase.storage.from("layer-files").getPublicUrl(geojsonStoragePath);
    patch.artifact_url = geojsonUrl.publicUrl;
  }

  const { error: updateError } = await supabase.from("datasets").update(patch).eq("id", datasetId);
  if (updateError) {
    throw new Error(`Failed to update dataset artifact: ${updateError.message}`);
  }

  return patch;
}

function normalizeDatasetMetadataValue(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

async function createDatasetRecord(supabase, {
  layerId,
  name,
  geometryType,
  fieldSchema,
  license,
  licenseUrl,
  attribution,
}) {
  const { data, error } = await supabase
    .from("datasets")
    .insert({
      layer_id: layerId,
      name,
      license: normalizeDatasetMetadataValue(license),
      license_url: normalizeDatasetMetadataValue(licenseUrl),
      attribution: normalizeDatasetMetadataValue(attribution),
      geometry_type: geometryType,
      field_schema: Array.isArray(fieldSchema) ? fieldSchema : [],
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Failed to create dataset: ${error.message}`);
  }

  return data.id;
}

async function updateLayerSummary(supabase, layerId, nextGeometryType) {
  const { data: layer, error: readError } = await supabase
    .from("layers")
    .select("geometry_type")
    .eq("id", layerId)
    .single();

  if (readError) {
    throw new Error(`Failed to read layer summary: ${readError.message}`);
  }

  const mergedGeometryType = mergeLayerGeometryType(layer?.geometry_type ?? null, nextGeometryType);
  const { error: updateError } = await supabase
    .from("layers")
    .update({ geometry_type: mergedGeometryType })
    .eq("id", layerId);

  if (updateError) {
    throw new Error(`Failed to update layer summary: ${updateError.message}`);
  }
}

export async function createLayerWithDataset({
  name,
  datasetName = "",
  license = "",
  licenseUrl = "",
  attribution = "",
  viewAccess,
  features,
  fieldSchema = [],
  rawFile,
  usePmtiles,
  onProgress,
}) {
  const supabase = requireSupabase();
  const geometryType = inferGeometryType(features);
  const resolvedDatasetName = String(datasetName || rawFile?.name || name || "Dataset").replace(/\.[^.]+$/, "").trim() || "Dataset";
  const artifactFormat = usePmtiles ? "pmtiles" : "geojson";
  const geojson = buildFeatureCollection(features);
  const geojsonText = artifactFormat === "geojson" ? JSON.stringify(geojson) : null;
  let layerId = null;
  let datasetId = null;
  let pmtilesDiagnostics = null;

  try {
    let pmtilesBuffer = null;
    if (usePmtiles) {
      onProgress?.(0, "Generating PMTiles...");
      const generated = await generatePmtilesInWorker(geojson, (pct) => {
        onProgress?.(Math.round(pct * 0.4), "Generating PMTiles...");
      });
      pmtilesBuffer = generated.buffer;
      pmtilesDiagnostics = generated.diagnostics;
    }

    onProgress?.(usePmtiles ? 42 : 5, "Creating layer...");
    const { data: layer, error: layerError } = await supabase
      .from("layers")
      .insert({
        name,
        view_access: viewAccess,
        geometry_type: geometryType,
        default_style: defaultStyleForType(geometryType),
      })
      .select("id")
      .single();

    if (layerError) {
      throw new Error(`Failed to create layer: ${layerError.message}`);
    }
    layerId = layer.id;

    datasetId = await createDatasetRecord(supabase, {
      layerId,
      name: resolvedDatasetName,
      license,
      licenseUrl,
      attribution,
      geometryType,
      fieldSchema,
    });

    await uploadDatasetArtifact(supabase, {
      layerId,
      datasetId,
      layerName: name,
      rawFile,
      artifactFormat,
      geojsonText,
      pmtilesBuffer,
      pmtilesDiagnostics,
      onProgress,
      progressOffset: usePmtiles ? 52 : 8,
    });

    await insertFeatureBatches(supabase, datasetId, features, {
      onProgress,
      progressStart: usePmtiles ? 62 : 12,
      progressEnd: 100,
    });

    return { layerId, datasetId };
  } catch (error) {
    const cleanupIssues = await cleanupPartialUpload(supabase, { datasetId, layerId });
    if (cleanupIssues.length) {
      throw new Error(`${error.message} Cleanup may be incomplete: ${cleanupIssues.join("; ")}.`);
    }
    throw error;
  }
}

export async function addDatasetToLayer({
  layerId,
  name = "",
  license = "",
  licenseUrl = "",
  attribution = "",
  features,
  fieldSchema = [],
  rawFile,
  usePmtiles,
  onProgress,
}) {
  const supabase = requireSupabase();
  const geometryType = inferGeometryType(features);
  const datasetName = String(name || rawFile?.name || "Dataset").replace(/\.[^.]+$/, "").trim() || "Dataset";
  const artifactFormat = usePmtiles ? "pmtiles" : "geojson";
  const geojson = buildFeatureCollection(features);
  const geojsonText = artifactFormat === "geojson" ? JSON.stringify(geojson) : null;
  let datasetId = null;
  let layerName = "layer";
  let pmtilesDiagnostics = null;

  try {
    const { data: layer, error: layerError } = await supabase
      .from("layers")
      .select("id, name")
      .eq("id", layerId)
      .single();

    if (layerError) {
      throw new Error(`Failed to load layer: ${layerError.message}`);
    }
    layerName = layer?.name ?? layerName;

    let pmtilesBuffer = null;
    if (usePmtiles) {
      onProgress?.(0, "Generating PMTiles...");
      const generated = await generatePmtilesInWorker(geojson, (pct) => {
        onProgress?.(Math.round(pct * 0.4), "Generating PMTiles...");
      });
      pmtilesBuffer = generated.buffer;
      pmtilesDiagnostics = generated.diagnostics;
    }

    onProgress?.(usePmtiles ? 42 : 5, "Creating dataset...");
    datasetId = await createDatasetRecord(supabase, {
      layerId,
      name: datasetName,
      license,
      licenseUrl,
      attribution,
      geometryType,
      fieldSchema,
    });

    await uploadDatasetArtifact(supabase, {
      layerId,
      datasetId,
      layerName,
      rawFile,
      artifactFormat,
      geojsonText,
      pmtilesBuffer,
      pmtilesDiagnostics,
      onProgress,
      progressOffset: usePmtiles ? 52 : 8,
    });

    await insertFeatureBatches(supabase, datasetId, features, {
      onProgress,
      progressStart: usePmtiles ? 62 : 12,
      progressEnd: 100,
    });

    await updateLayerSummary(supabase, layerId, geometryType);
    return { datasetId };
  } catch (error) {
    const cleanupIssues = await cleanupPartialUpload(supabase, { datasetId, layerId: null });
    if (cleanupIssues.length) {
      throw new Error(`${error.message} Cleanup may be incomplete: ${cleanupIssues.join("; ")}.`);
    }
    throw error;
  }
}

export async function appendFeaturesToDataset({ datasetId, features, onProgress }) {
  const supabase = requireSupabase();
  const { data: dataset, error: datasetError } = await supabase
    .from("datasets")
    .select("id, layer_id, geometry_type")
    .eq("id", datasetId)
    .single();

  if (datasetError) {
    throw new Error(`Failed to load dataset: ${datasetError.message}`);
  }

  const incomingGeometryType = inferGeometryType(features);
  const nextGeometryType = mergeLayerGeometryType(dataset.geometry_type, incomingGeometryType);

  onProgress?.(5, "Appending features...");
  const inserted = await insertFeatureBatches(supabase, datasetId, features, {
    onProgress,
    progressStart: 10,
    progressEnd: 100,
  });

  if (nextGeometryType !== dataset.geometry_type) {
    const { error: updateDatasetError } = await supabase
      .from("datasets")
      .update({ geometry_type: nextGeometryType })
      .eq("id", datasetId);

    if (updateDatasetError) {
      throw new Error(`Failed to update dataset geometry: ${updateDatasetError.message}`);
    }

    await updateLayerSummary(supabase, dataset.layer_id, nextGeometryType);
  }

  return { datasetId, inserted };
}
