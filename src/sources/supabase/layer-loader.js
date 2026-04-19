import { requireSupabase } from "../../lib/supabase.js";

function normalizeGeometryTypes(geometryTypes = [], geometryType = "mixed") {
  const source = Array.isArray(geometryTypes) && geometryTypes.length
    ? geometryTypes
    : [geometryType];
  const normalized = source.map((value) => {
    if (value === "point") return "point";
    if (value === "line") return "line";
    if (value === "polygon" || value === "area") return "polygon";
    return null;
  }).filter(Boolean);
  return ["point", "line", "polygon"].filter((family) => normalized.includes(family));
}

function isMissingLayerError(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return error?.code === "PGRST116"
    || message.includes("0 rows")
    || message.includes("no rows");
}

function mergeSchemaFields(datasetRows) {
  const fields = [];
  const seenKeys = new Set();

  datasetRows.forEach((dataset) => {
    const schema = Array.isArray(dataset?.field_schema) ? dataset.field_schema : [];
    schema.forEach((field) => {
      const key = String(field?.key ?? "");
      if (!key || seenKeys.has(key) || field?.visible === false) {
        return;
      }
      fields.push({
        key,
        label: field.label ?? key,
        type: field.type ?? "text",
        source: "property",
      });
      seenKeys.add(key);
    });
  });

  return { fields, seenKeys };
}

function buildTablePreviewFromDatasetsAndRows(datasets, rows, { limit = 50, offset = 0, datasetId = "" } = {}) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const scopedDatasets = datasetId
    ? datasets.filter((dataset) => dataset.id === datasetId)
    : datasets;
  const datasetIds = new Set(scopedDatasets.map((dataset) => dataset.id));
  const totalRowCount = scopedDatasets.reduce((sum, dataset) => sum + Math.max(0, Number(dataset?.feature_count) || 0), 0);

  if (!scopedDatasets.length) {
    return {
      offset: safeOffset,
      limit: safeLimit,
      rows: [],
      fields: [],
      totalRowCount: 0,
      hasMore: false,
    };
  }

  const filteredRows = datasetIds.size
    ? rows.filter((row) => {
      if (!datasetId) {
        return true;
      }
      return row?.dataset_id === datasetId
        || row?.properties?.dataset_id === datasetId
        || row?.properties?._dataset_id === datasetId;
    })
    : [];
  const pagedRows = filteredRows.slice(safeOffset, safeOffset + safeLimit);
  const { fields, seenKeys } = mergeSchemaFields(scopedDatasets);
  const finalFields = [...fields];

  pagedRows.forEach((row) => {
    if (row?.properties && typeof row.properties === "object") {
      Object.keys(row.properties).forEach((key) => {
        if (!String(key).startsWith("_") && !seenKeys.has(key)) {
          finalFields.push({
            key,
            label: key,
            type: "text",
            source: "property",
          });
          seenKeys.add(key);
        }
      });
    }
  });

  return {
    offset: safeOffset,
    limit: safeLimit,
    rows: pagedRows,
    fields: finalFields,
    totalRowCount: totalRowCount || filteredRows.length,
    hasMore: safeOffset + pagedRows.length < (totalRowCount || filteredRows.length),
  };
}

async function loadLayerDatasets(layerId) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("datasets")
    .select("id, layer_id, name, license, license_url, attribution, geometry_type, geometry_types, field_schema, render_format, artifact_url, feature_count, created_at")
    .eq("layer_id", layerId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load datasets: ${error.message}`);
  }

  return Array.isArray(data) ? data : [];
}

// Merges a partial style patch into the layer's default_style in Supabase.
// key/value pairs map directly to default_style fields (color, opacity, radius, weight).
export async function updateLayerDefaultStyle(layerId, patch) {
  const supabase = requireSupabase();
  const { data: layer, error: readError } = await supabase
    .from("layers")
    .select("default_style")
    .eq("id", layerId)
    .single();

  if (readError) throw new Error(readError.message);

  const merged = { ...(layer.default_style ?? {}), ...patch };

  const { error } = await supabase
    .from("layers")
    .update({ default_style: merged })
    .eq("id", layerId);

  if (error) throw new Error(error.message);
}

export async function getSupabaseCatalog() {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("layers")
    .select("id, name, geometry_type, geometry_types")
    .in("view_access", ["public", "unlisted"])
    .order("name");

  if (error || !data?.length) return [];

  return data.map((layer) => ({
    id: layer.id,
    label: layer.name,
    group: "Uploaded layers",
    geometryTypes: normalizeGeometryTypes(layer.geometry_types, layer.geometry_type ?? "mixed"),
    geometryType: layer.geometry_type ?? "mixed",
  }));
}

export async function getLayerDatasets(layerId) {
  return loadLayerDatasets(layerId);
}

// Returns sorted distinct values for a specific property field, sampled from up to 200 features.
export async function getLayerFieldValues(layerId, field) {
  const supabase = requireSupabase();
  const datasets = await loadLayerDatasets(layerId);
  const datasetIds = datasets.map((dataset) => dataset.id);

  if (!datasetIds.length) {
    return null;
  }

  const { data, error } = await supabase
    .from("features")
    .select("properties")
    .in("dataset_id", datasetIds)
    .limit(200);

  if (error || !data?.length) return null;

  const seen = new Set();
  for (const row of data) {
    const value = row.properties?.[field];
    if (value !== undefined && value !== null && value !== "") {
      seen.add(value);
    }
  }

  if (!seen.size) return null;

  return [...seen].sort((a, b) => {
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b));
  });
}

// Returns sorted unique property field names for a layer.
export async function getLayerFields(layerId) {
  const supabase = requireSupabase();
  const datasets = await loadLayerDatasets(layerId);
  const { fields } = mergeSchemaFields(datasets);

  if (fields.length) {
    return fields.map((field) => field.key);
  }

  const datasetIds = datasets.map((dataset) => dataset.id);
  if (!datasetIds.length) {
    return null;
  }

  const { data, error } = await supabase
    .from("features")
    .select("properties")
    .in("dataset_id", datasetIds)
    .limit(20);

  if (error || !data?.length) return null;

  const keys = new Set();
  for (const row of data) {
    if (row.properties && typeof row.properties === "object") {
      Object.keys(row.properties).forEach((key) => keys.add(key));
    }
  }

  return [...keys].filter((key) => !key.startsWith("_")).sort();
}

export async function getLayerTablePreview(layerId, { limit = 50, offset = 0, datasetId = "" } = {}) {
  const supabase = requireSupabase();
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const datasets = await loadLayerDatasets(layerId);
  const scopedDatasets = datasetId
    ? datasets.filter((dataset) => dataset.id === datasetId)
    : datasets;
  const datasetIds = scopedDatasets.map((dataset) => dataset.id);
  const totalRowCount = scopedDatasets.reduce((sum, dataset) => sum + Math.max(0, Number(dataset?.feature_count) || 0), 0);

  if (!datasetIds.length) {
    return {
      offset: safeOffset,
      limit: safeLimit,
      rows: [],
      fields: [],
      totalRowCount: 0,
      hasMore: false,
    };
  }

  const { data, error } = await supabase
    .from("features")
    .select("id, dataset_id, properties, valid_from, valid_to")
    .in("dataset_id", datasetIds)
    .order("created_at", { ascending: true })
    .range(safeOffset, safeOffset + safeLimit - 1);

  if (error) throw new Error(error.message);

  const rows = Array.isArray(data) ? data : [];
  const { fields, seenKeys } = mergeSchemaFields(scopedDatasets);
  const finalFields = [];

  fields.forEach((field) => finalFields.push(field));

  rows.forEach((row) => {
    if (row?.properties && typeof row.properties === "object") {
      Object.keys(row.properties).forEach((key) => {
        if (!String(key).startsWith("_") && !seenKeys.has(key)) {
          finalFields.push({
            key,
            label: key,
            type: "text",
            source: "property",
          });
          seenKeys.add(key);
        }
      });
    }
  });

  return {
    offset: safeOffset,
    limit: safeLimit,
    rows,
    fields: finalFields,
    totalRowCount,
    hasMore: safeOffset + rows.length < totalRowCount,
  };
}

export function getLayerTablePreviewFromLoadedData(loadedLayer, { limit = 50, offset = 0, datasetId = "" } = {}) {
  const datasets = Array.isArray(loadedLayer?.datasets) ? loadedLayer.datasets : [];
  const features = Array.isArray(loadedLayer?.geojson?.features) ? loadedLayer.geojson.features : [];
  if (!datasets.length || !features.length) {
    return null;
  }

  const rows = features.map((feature, index) => ({
    id: feature?.id ?? feature?.properties?.id ?? `cached-${index}`,
    dataset_id: feature?.properties?.dataset_id ?? feature?.properties?._dataset_id ?? "",
    properties: feature?.properties && typeof feature.properties === "object" ? feature.properties : {},
    valid_from: feature?.properties?.valid_from ?? "",
    valid_to: feature?.properties?.valid_to ?? "",
  }));

  return buildTablePreviewFromDatasetsAndRows(datasets, rows, { limit, offset, datasetId });
}

const MAX_GEOJSON_FEATURES = 10_000;

async function loadGeojsonArtifact(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch GeoJSON artifact: ${response.status}`);
  }
  return response.json();
}

export async function loadLayerFromSupabase(layerId) {
  const supabase = requireSupabase();
  const { data: layer, error: layerError } = await supabase
    .from("layers")
    .select("id, name, geometry_type, geometry_types, default_style, feature_count")
    .eq("id", layerId)
    .single();

  if (layerError) {
    const error = new Error(`Failed to load layer: ${layerError.message}`);
    if (isMissingLayerError(layerError)) {
      error.code = "LAYER_NOT_FOUND";
    }
    throw error;
  }

  const datasets = await loadLayerDatasets(layerId);
  if (datasets.length === 1) {
    const [dataset] = datasets;
    if (dataset?.render_format === "pmtiles" && dataset?.artifact_url) {
      return {
        layer: {
          ...layer,
          geometryTypes: normalizeGeometryTypes(layer.geometry_types, layer.geometry_type ?? "mixed"),
        },
        datasets,
        geojson: null,
        tilesUrl: dataset.artifact_url,
      };
    }

    if (dataset?.render_format === "geojson" && dataset?.artifact_url) {
      const geojson = await loadGeojsonArtifact(dataset.artifact_url);
      return {
        layer: {
          ...layer,
          geometryTypes: normalizeGeometryTypes(layer.geometry_types, layer.geometry_type ?? "mixed"),
        },
        datasets,
        geojson,
        tilesUrl: null,
      };
    }
  }

  if (datasets.some((dataset) => dataset.render_format === "pmtiles" && dataset.artifact_url)) {
    console.warn("Layer has multiple datasets, so loader is falling back to merged GeoJSON instead of per-dataset PMTiles.");
  }

  if ((layer.feature_count ?? 0) > MAX_GEOJSON_FEATURES) {
    console.warn(`Layer has ${layer.feature_count} features - too large to load as GeoJSON. Re-upload with tile generation enabled.`);
    return {
      layer: {
        ...layer,
        geometryTypes: normalizeGeometryTypes(layer.geometry_types, layer.geometry_type ?? "mixed"),
      },
      datasets,
      geojson: null,
      tilesUrl: null,
    };
  }

  const { data: geojson, error: geojsonError } = await supabase.rpc("get_layer_geojson", { p_layer_id: layerId });
  if (geojsonError) throw new Error(`Failed to load features: ${geojsonError.message}`);

  return {
    layer: {
      ...layer,
      geometryTypes: normalizeGeometryTypes(layer.geometry_types, layer.geometry_type ?? "mixed"),
    },
    datasets,
    geojson,
    tilesUrl: null,
  };
}
