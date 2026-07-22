import { requireSupabase } from "../../lib/supabase.js";
import {
  DATASET_FILTER_FIELD,
  DATASET_FILTER_LABEL,
  DATASET_FILTER_PROPERTY,
  evaluatePropertyExpression,
} from "../../core/filter-expressions.js";

const LOCAL_BORDERS_PMTILES_URL = "/data/world-atlas/ne_10m_admin_0_boundary_lines_land.pmtiles";
const DEFAULT_PMTILES_SOURCE_LAYER = "layer";
const FIELD_VALUE_PAGE_SIZE = 500;
const CLIENT_FIELD_SCAN_LIMIT = 5000;
const CLIENT_VALUE_SCAN_LIMIT = 10000;
const LAYER_RESULT_CACHE_DB = "layersv2.supabaseLayerResults";
const LAYER_RESULT_CACHE_STORE = "layerResults";
const LAYER_RESULT_CACHE_VERSION = 1;
let catalogCache = null;
let catalogRequest = null;

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

function isBordersLayer(layer) {
  return String(layer?.name ?? "").trim().toLowerCase() === "borders";
}

function humanizeFieldLabel(key) {
  return String(key ?? "")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function normalizeFieldType(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    normalized.includes("number")
    || normalized.includes("numeric")
    || normalized.includes("integer")
    || normalized.includes("float")
    || normalized.includes("double")
    || normalized === "int"
    || normalized === "uint"
  ) {
    return "number";
  }
  if (normalized.includes("bool")) return "boolean";
  if (normalized.includes("date") || normalized.includes("time")) return "date";
  return "text";
}

function buildFieldSchemaFromArtifactMetadata(dataset) {
  const metadata = dataset?.artifact_metadata;
  if (!metadata || typeof metadata !== "object") return [];
  if (Array.isArray(metadata.field_schema)) {
    return metadata.field_schema.filter((field) => field?.key);
  }

  const sourceLayer = String(dataset?.source_layer ?? DEFAULT_PMTILES_SOURCE_LAYER);
  const vectorLayers = Array.isArray(metadata.vector_layers) ? metadata.vector_layers : [];
  const layer = vectorLayers.find((candidate) => String(candidate?.id ?? "") === sourceLayer) ?? vectorLayers[0];
  if (!layer?.fields || typeof layer.fields !== "object" || Array.isArray(layer.fields)) {
    return [];
  }

  return Object.entries(layer.fields)
    .map(([key, type]) => ({
      key: String(key ?? "").trim(),
      label: humanizeFieldLabel(key),
      type: normalizeFieldType(type),
      required: false,
      visible: true,
      sortable: true,
      filterable: true,
    }))
    .filter((field) => field.key);
}

function getDatasetFieldSchema(dataset) {
  const schema = Array.isArray(dataset?.field_schema) ? dataset.field_schema.filter((field) => field?.key) : [];
  return schema.length ? schema : buildFieldSchemaFromArtifactMetadata(dataset);
}

function mergeSchemaFields(datasetRows) {
  const fields = [];
  const seenKeys = new Set();

  datasetRows.forEach((dataset) => {
    const schema = getDatasetFieldSchema(dataset);
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
    .select("id, layer_id, name, license, license_url, attribution, geometry_type, geometry_types, field_schema, render_format, artifact_url, source_layer, minzoom, maxzoom, bounds, artifact_metadata, feature_inspector, feature_count, created_at")
    .eq("layer_id", layerId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load datasets: ${error.message}`);
  }

  return Array.isArray(data) ? data : [];
}

export async function updateDatasetName(datasetId, name) {
  const supabase = requireSupabase();
  const nextName = String(name ?? "").trim();
  if (!datasetId || !nextName) {
    throw new Error("Dataset name cannot be empty.");
  }

  const { error } = await supabase
    .from("datasets")
    .update({ name: nextName })
    .eq("id", datasetId);

  if (error) {
    throw new Error(`Failed to rename dataset: ${error.message}`);
  }

  return { id: datasetId, name: nextName };
}

export async function updateLayerName(layerId, name) {
  const supabase = requireSupabase();
  const nextName = String(name ?? "").trim();
  if (!layerId || !nextName) {
    throw new Error("Layer name cannot be empty.");
  }

  const { error } = await supabase
    .from("layers")
    .update({ name: nextName })
    .eq("id", layerId);

  if (error) {
    throw new Error(`Failed to rename layer: ${error.message}`);
  }

  if (Array.isArray(catalogCache)) {
    catalogCache = catalogCache.map((layer) => (
      layer?.id === layerId ? { ...layer, label: nextName, name: nextName } : layer
    ));
    catalogCache.sort((left, right) => String(left?.label ?? "").localeCompare(String(right?.label ?? "")));
  }

  return { id: layerId, name: nextName };
}

export async function deleteLayer(layerId) {
  const supabase = requireSupabase();
  const normalizedLayerId = String(layerId ?? "").trim();
  if (!normalizedLayerId) {
    throw new Error("Layer is required.");
  }

  const { error } = await supabase
    .from("layers")
    .delete()
    .eq("id", normalizedLayerId);

  if (error) {
    throw new Error(`Failed to delete layer: ${error.message}`);
  }

  invalidateSupabaseCatalogCache();
  return { id: normalizedLayerId };
}

export function invalidateSupabaseCatalogCache() {
  catalogCache = null;
  catalogRequest = null;
}

export async function updateDatasetMetadata(datasetId, { license = "", licenseUrl = "", attribution = "" } = {}) {
  const supabase = requireSupabase();
  if (!datasetId) {
    throw new Error("Dataset is required.");
  }

  const patch = {
    license: String(license ?? "").trim() || null,
    license_url: String(licenseUrl ?? "").trim() || null,
    attribution: String(attribution ?? "").trim() || null,
  };

  const { data, error } = await supabase
    .from("datasets")
    .update(patch)
    .eq("id", datasetId)
    .select("id, license, license_url, attribution")
    .single();

  if (error) {
    throw new Error(`Failed to update dataset metadata: ${error.message}`);
  }

  return data;
}

export async function updateDatasetFeatureInspector(datasetId, featureInspector = {}) {
  const supabase = requireSupabase();
  if (!datasetId) {
    throw new Error("Dataset is required.");
  }
  const nextFeatureInspector = featureInspector && typeof featureInspector === "object"
    ? featureInspector
    : {};

  const { data, error } = await supabase
    .from("datasets")
    .update({ feature_inspector: nextFeatureInspector })
    .eq("id", datasetId)
    .select("id, feature_inspector")
    .single();

  if (error) {
    throw new Error(`Failed to update feature panel defaults: ${error.message}`);
  }

  return data;
}

export async function updateLayerDatasetsFeatureInspector(layerId, featureInspector = {}) {
  const supabase = requireSupabase();
  if (!layerId) {
    throw new Error("Layer is required.");
  }
  const nextFeatureInspector = featureInspector && typeof featureInspector === "object"
    ? featureInspector
    : {};

  const { data, error } = await supabase
    .from("datasets")
    .update({ feature_inspector: nextFeatureInspector })
    .eq("layer_id", layerId)
    .select("id, feature_inspector");

  if (error) {
    throw new Error(`Failed to apply feature panel defaults to layer: ${error.message}`);
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

export async function getSupabaseCatalog({ forceRefresh = false } = {}) {
  if (!forceRefresh && catalogCache) {
    return catalogCache.map((entry) => ({ ...entry, geometryTypes: entry.geometryTypes.slice() }));
  }
  if (!forceRefresh && catalogRequest) {
    return catalogRequest;
  }

  const supabase = requireSupabase();
  catalogRequest = supabase
    .from("layers")
    .select("id, name, geometry_type, geometry_types")
    .in("view_access", ["public", "unlisted"])
    .order("name")
    .then(({ data, error }) => {
      if (error || !data?.length) {
        catalogCache = [];
        return [];
      }

      catalogCache = data.map((layer) => ({
        id: layer.id,
        label: layer.name,
        group: "Uploaded layers",
        geometryTypes: normalizeGeometryTypes(layer.geometry_types, layer.geometry_type ?? "mixed"),
        geometryType: layer.geometry_type ?? "mixed",
      }));
      return catalogCache.map((entry) => ({ ...entry, geometryTypes: entry.geometryTypes.slice() }));
    })
    .finally(() => {
      catalogRequest = null;
    });

  return catalogRequest;
}

export async function getLayerDatasets(layerId) {
  return loadLayerDatasets(layerId);
}

// Returns sorted unique property field names for a layer.
export async function getLayerFields(layerId) {
  const supabase = requireSupabase();
  const datasets = await loadLayerDatasets(layerId);
  const datasetField = datasets.length
    ? [{ value: DATASET_FILTER_FIELD, label: DATASET_FILTER_LABEL }]
    : [];
  const { fields } = mergeSchemaFields(datasets);

  if (fields.length) {
    return [
      ...datasetField,
      ...fields.map((field) => field.key),
    ];
  }

  const datasetIds = datasets.map((dataset) => dataset.id);
  if (!datasetIds.length) {
    return null;
  }

  const keys = new Set();
  const pageSize = FIELD_VALUE_PAGE_SIZE;
  let offset = 0;
  while (offset < CLIENT_FIELD_SCAN_LIMIT) {
    const end = Math.min(offset + pageSize - 1, CLIENT_FIELD_SCAN_LIMIT - 1);
    const { data, error } = await supabase
      .from("features")
      .select("properties")
      .in("dataset_id", datasetIds)
      .order("dataset_id", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, end);

    if (error) {
      console.warn("Failed to load layer fields.", error);
      break;
    }
    if (!data?.length) {
      break;
    }

    for (const row of data) {
      if (row.properties && typeof row.properties === "object") {
        Object.keys(row.properties).forEach((key) => keys.add(key));
      }
    }

    if (data.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  return [
    ...datasetField,
    ...[...keys].filter((key) => !key.startsWith("_")).sort(),
  ];
}

export async function getLayerFieldValues(layerId, fieldKey, { limit = FIELD_VALUE_PAGE_SIZE, filterExpression = null } = {}) {
  const supabase = requireSupabase();
  const key = String(fieldKey ?? "").trim();
  if (!layerId || !key) {
    return [];
  }

  const datasets = await loadLayerDatasets(layerId);
  const datasetIds = datasets.map((dataset) => dataset.id);
  const pageSize = Math.max(1, Math.min(1000, Number(limit) || FIELD_VALUE_PAGE_SIZE));
  if (key === DATASET_FILTER_FIELD || key === DATASET_FILTER_PROPERTY) {
    let matchingDatasetIds = null;
    if (filterExpression && datasetIds.length) {
      matchingDatasetIds = new Set();
      let datasetOffset = 0;
      while (datasetOffset < CLIENT_VALUE_SCAN_LIMIT) {
        const end = Math.min(datasetOffset + pageSize - 1, CLIENT_VALUE_SCAN_LIMIT - 1);
        const { data, error } = await supabase
          .from("features")
          .select("dataset_id, properties")
          .in("dataset_id", datasetIds)
          .order("dataset_id", { ascending: true })
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(datasetOffset, end);

        if (error) {
          console.warn("Failed to load dataset filter values.", error);
          matchingDatasetIds = null;
          break;
        }
        if (!data?.length) {
          break;
        }

        data.forEach((row) => {
          const properties = row?.properties && typeof row.properties === "object" ? {
            ...row.properties,
            [DATASET_FILTER_PROPERTY]: row.dataset_id ?? row.properties?.[DATASET_FILTER_PROPERTY],
          } : {
            [DATASET_FILTER_PROPERTY]: row?.dataset_id,
          };
          if (evaluatePropertyExpression(filterExpression, properties) && row?.dataset_id) {
            matchingDatasetIds.add(row.dataset_id);
          }
        });

        if (data.length < pageSize) {
          break;
        }
        datasetOffset += pageSize;
      }
    }

    return datasets
      .filter((dataset) => dataset?.id && (!matchingDatasetIds || matchingDatasetIds.has(dataset.id)))
      .map((dataset) => ({
        value: String(dataset.id),
        label: String(dataset.name || "Dataset"),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  const values = new Set();
  let offset = 0;
  let rpcUnavailable = !!filterExpression;

  if (!filterExpression) {
    while (true) {
      const { data, error } = await supabase.rpc("get_layer_property_values", {
        p_layer_id: layerId,
        p_field_key: key,
        p_limit: pageSize,
        p_offset: offset,
      });

      if (error) {
        rpcUnavailable = true;
        console.warn("Falling back to client-side field value scan.", error);
        break;
      }

      const pageValues = Array.isArray(data)
        ? data.map((row) => row?.value).filter((value) => value !== null && value !== undefined)
        : [];
      pageValues.forEach((value) => values.add(String(value)));
      if (pageValues.length < pageSize) {
        return sortFieldValues(values);
      }
      offset += pageValues.length;
    }
  }

  if (!rpcUnavailable) {
    return sortFieldValues(values);
  }

  if (!datasetIds.length) {
    return [];
  }

  offset = 0;
  while (offset < CLIENT_VALUE_SCAN_LIMIT) {
    const end = Math.min(offset + pageSize - 1, CLIENT_VALUE_SCAN_LIMIT - 1);
    const { data, error } = await supabase
      .from("features")
      .select("dataset_id, properties")
      .in("dataset_id", datasetIds)
      .order("dataset_id", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, end);

    if (error) {
      console.warn("Failed to load field values.", error);
      break;
    }
    if (!data?.length) {
      break;
    }

    data.forEach((row) => {
      const properties = row?.properties && typeof row.properties === "object" ? {
        ...row.properties,
        [DATASET_FILTER_PROPERTY]: row.dataset_id ?? row.properties?.[DATASET_FILTER_PROPERTY],
      } : {
        [DATASET_FILTER_PROPERTY]: row?.dataset_id,
      };
      if (filterExpression && !evaluatePropertyExpression(filterExpression, properties)) {
        return;
      }
      if (!Object.hasOwn(properties, key)) {
        return;
      }
      const value = properties[key];
      if (value === null || value === undefined) {
        return;
      }
      values.add(String(value));
    });

    if (data.length < pageSize) {
      break;
    }
    offset += pageSize;
  }

  return sortFieldValues(values);
}

function sortFieldValues(values) {
  return [...values].sort((a, b) => {
    const an = Number(a);
    const bn = Number(b);
    if (Number.isFinite(an) && Number.isFinite(bn)) {
      return an - bn;
    }
    return a.localeCompare(b);
  });
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

  const fallbackDatasetId = datasets.length === 1 ? datasets[0]?.id ?? "" : "";
  const rows = features.map((feature, index) => ({
    id: feature?.id ?? feature?.properties?.id ?? `cached-${index}`,
    dataset_id: feature?.properties?.dataset_id ?? feature?.properties?._dataset_id ?? fallbackDatasetId,
    properties: feature?.properties && typeof feature.properties === "object" ? feature.properties : {},
    valid_from: feature?.properties?.valid_from ?? "",
    valid_to: feature?.properties?.valid_to ?? "",
  }));

  return buildTablePreviewFromDatasetsAndRows(datasets, rows, { limit, offset, datasetId });
}

const MAX_GEOJSON_FEATURES = 10_000;
const FILTERED_GEOJSON_FEATURES_MAX = 10_000;

function createLayerLoadWarning(code, message, details = {}) {
  return {
    code,
    message,
    details,
  };
}

function isMissingColumnError(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return error?.code === "42703"
    || error?.code === "PGRST204"
    || message.includes("does not exist")
    || message.includes("could not find")
    || message.includes("schema cache");
}

function getLayerResultCacheKey(layerId, propertyFilter = null) {
  return `${String(layerId ?? "")}:${JSON.stringify(propertyFilter ?? null)}`;
}

function openLayerResultCache() {
  if (typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const request = indexedDB.open(LAYER_RESULT_CACHE_DB, LAYER_RESULT_CACHE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LAYER_RESULT_CACHE_STORE)) {
        db.createObjectStore(LAYER_RESULT_CACHE_STORE, { keyPath: "cacheKey" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

async function readLayerResultCacheRecord(layerId, propertyFilter = null) {
  const db = await openLayerResultCache();
  if (!db) {
    return null;
  }
  return new Promise((resolve) => {
    const transaction = db.transaction(LAYER_RESULT_CACHE_STORE, "readonly");
    const store = transaction.objectStore(LAYER_RESULT_CACHE_STORE);
    const request = store.get(getLayerResultCacheKey(layerId, propertyFilter));
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => resolve(null);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => db.close();
  });
}

async function writeLayerResultCacheRecord(layerId, propertyFilter, layerResult) {
  const db = await openLayerResultCache();
  if (!db || !layerResult || typeof layerResult !== "object") {
    return;
  }
  const cacheKey = getLayerResultCacheKey(layerId, propertyFilter);
  const record = {
    cacheKey,
    layerId,
    propertyFilter: propertyFilter ?? null,
    cachedAt: Date.now(),
    layerResult,
  };
  await new Promise((resolve) => {
    const transaction = db.transaction(LAYER_RESULT_CACHE_STORE, "readwrite");
    const store = transaction.objectStore(LAYER_RESULT_CACHE_STORE);
    store.put(record);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      resolve();
    };
  });
}

export async function getCachedLayerResult(layerId, propertyFilter = null) {
  const record = await readLayerResultCacheRecord(layerId, propertyFilter);
  return record?.layerResult && typeof record.layerResult === "object"
    ? record.layerResult
    : null;
}

export async function clearCachedLayerResults(layerId) {
  const db = await openLayerResultCache();
  if (!db || !layerId) {
    return;
  }
  await new Promise((resolve) => {
    const transaction = db.transaction(LAYER_RESULT_CACHE_STORE, "readwrite");
    const store = transaction.objectStore(LAYER_RESULT_CACHE_STORE);
    const prefix = `${String(layerId)}:`;
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        return;
      }
      if (String(cursor.key).startsWith(prefix)) {
        cursor.delete();
      }
      cursor.continue();
    };
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      resolve();
    };
  });
}

export async function getLayerDefaultView(layerId) {
  const supabase = requireSupabase();
  if (!layerId) {
    return {};
  }
  const { data, error } = await supabase
    .from("layers")
    .select("default_view")
    .eq("id", layerId)
    .single();

  if (error) {
    if (isMissingColumnError(error)) {
      return {};
    }
    throw new Error(`Failed to load layer defaults: ${error.message}`);
  }

  return data?.default_view && typeof data.default_view === "object" ? data.default_view : {};
}

export async function updateLayerDefaultView(layerId, defaultView = {}) {
  const supabase = requireSupabase();
  if (!layerId) {
    throw new Error("Layer is required.");
  }
  const nextDefaultView = defaultView && typeof defaultView === "object" && !Array.isArray(defaultView)
    ? defaultView
    : {};

  const { error } = await supabase
    .from("layers")
    .update({ default_view: nextDefaultView })
    .eq("id", layerId);

  if (error) {
    if (isMissingColumnError(error)) {
      throw new Error("Layer defaults are not configured yet. Run the default_view migration in Supabase.");
    }
    throw new Error(`Failed to save layer defaults: ${error.message}`);
  }
}

async function loadGeojsonArtifact(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch GeoJSON artifact: ${response.status}`);
  }
  return response.json();
}

function featureFromRow(row, datasetById) {
  const dataset = datasetById.get(row?.dataset_id) ?? null;
  return {
    type: "Feature",
    id: row?.id,
    geometry: row?.geometry,
    properties: {
      ...(row?.properties && typeof row.properties === "object" ? row.properties : {}),
      _dataset_id: row?.dataset_id ?? "",
      _dataset_name: dataset?.name ?? "",
    },
  };
}

function buildPropertyFilterExpression(filter) {
  if (Array.isArray(filter?.expression)) {
    return filter.expression;
  }

  const conditions = Array.isArray(filter?.conditions)
    ? filter.conditions
      .map((condition) => ({
        field: String(condition?.field ?? "").trim(),
        op: condition?.op ?? "==",
        value: condition?.value,
      }))
      .filter((condition) => condition.field)
    : [];

  if (conditions.length) {
    const expressions = conditions.map((condition) => {
      if ([">", ">=", "<", "<="].includes(condition.op)) {
        return [
          condition.op,
          ["to-number", ["coalesce", ["get", condition.field], 0]],
          Number(condition.value) || 0,
        ];
      }
      if (condition.op === "!=") {
        return [
          "!=",
          ["to-string", ["coalesce", ["get", condition.field], ""]],
          condition.value == null ? "" : String(condition.value),
        ];
      }
      return [
        "==",
        ["to-string", ["coalesce", ["get", condition.field], ""]],
        condition.value == null ? "" : String(condition.value),
      ];
    });
    const combinator = filter?.combinator === "any" ? "any" : "all";
    return expressions.length === 1 ? expressions[0] : [combinator, ...expressions];
  }

  const field = String(filter?.field ?? "").trim();
  if (!field || filter?.value === undefined || filter?.value === null) {
    return null;
  }
  return [
    "==",
    ["to-string", ["coalesce", ["get", field], ""]],
    String(filter.value),
  ];
}

async function loadFilteredLayerGeojson(supabase, datasets, filter, { onProgress = null } = {}) {
  const field = String(filter?.field ?? "").trim();
  const value = filter?.value;
  const expression = buildPropertyFilterExpression(filter);
  const datasetIds = datasets.map((dataset) => dataset.id).filter(Boolean);
  if (!expression || !datasetIds.length) {
    return null;
  }

  const datasetById = new Map(datasets.map((dataset) => [dataset.id, dataset]));
  const pageSize = 1000;
  const features = [];
  let offset = 0;
  const canUseServerExactMatch = field && value !== undefined && value !== null && !Array.isArray(filter?.conditions);
  onProgress?.(35, canUseServerExactMatch
    ? `Loading scoped features for ${field} = ${value}`
    : "Loading scoped features");

  while (features.length <= FILTERED_GEOJSON_FEATURES_MAX) {
    let query = supabase
      .from("features")
      .select("id, dataset_id, geometry, properties")
      .in("dataset_id", datasetIds)
      .order("dataset_id", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });

    if (canUseServerExactMatch) {
      query = query.filter(`properties->>${field}`, "eq", String(value));
    }

    const { data, error } = await query.range(offset, offset + pageSize - 1);

    if (error) {
      throw new Error(`Failed to load filtered features: ${error.message}`);
    }

    const rows = Array.isArray(data) ? data : [];
    const matchingRows = canUseServerExactMatch
      ? rows
      : rows.filter((row) => {
        const dataset = datasetById.get(row?.dataset_id) ?? null;
        return evaluatePropertyExpression(expression, {
          ...(row?.properties && typeof row.properties === "object" ? row.properties : {}),
          _dataset_id: row?.dataset_id ?? "",
          _dataset_name: dataset?.name ?? "",
        });
      });
    features.push(...matchingRows.map((row) => featureFromRow(row, datasetById)).filter((feature) => feature.geometry));
    onProgress?.(45, `Loaded ${features.length.toLocaleString()} scoped features`);
    if (rows.length < pageSize) {
      return {
        type: "FeatureCollection",
        features,
      };
    }
    offset += rows.length;
  }

  throw new Error(`Filtered layer still has more than ${FILTERED_GEOJSON_FEATURES_MAX.toLocaleString()} features. Choose a narrower filter or use PMTiles.`);
}

function cacheAndReturnLayerResult(layerId, propertyFilter, layerResult) {
  void writeLayerResultCacheRecord(layerId, propertyFilter, layerResult);
  return layerResult;
}

export async function loadLayerFromSupabase(layerId, { propertyFilter = null, onProgress = null } = {}) {
  const supabase = requireSupabase();
  onProgress?.(15, "Loading layer metadata");
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

  onProgress?.(28, "Loading datasets");
  const defaultView = await getLayerDefaultView(layerId);
  const datasets = await loadLayerDatasets(layerId);
  onProgress?.(32, `Found ${datasets.length.toLocaleString()} datasets`);
  const filteredGeojson = await loadFilteredLayerGeojson(supabase, datasets, propertyFilter, { onProgress });
  if (filteredGeojson) {
    onProgress?.(62, `Loaded ${filteredGeojson.features.length.toLocaleString()} scoped features`);
    return cacheAndReturnLayerResult(layerId, propertyFilter, {
      layer: {
        ...layer,
        default_view: defaultView,
        geometryTypes: normalizeGeometryTypes(layer.geometry_types, layer.geometry_type ?? "mixed"),
      },
      datasets,
      geojson: filteredGeojson,
      tilesUrl: null,
      filterScope: propertyFilter,
    });
  }

  if (isBordersLayer(layer)) {
    onProgress?.(58, "Using local border tiles");
    return cacheAndReturnLayerResult(layerId, propertyFilter, {
      layer: {
        ...layer,
        default_view: defaultView,
        geometry_types: ["line"],
        geometry_type: "line",
        geometryTypes: ["line"],
      },
      datasets,
      geojson: null,
      tilesUrl: LOCAL_BORDERS_PMTILES_URL,
      sourceLayerId: DEFAULT_PMTILES_SOURCE_LAYER,
    });
  }

  if (datasets.length === 1) {
    const [dataset] = datasets;
    if (dataset?.render_format === "pmtiles" && dataset?.artifact_url) {
      onProgress?.(58, "Using PMTiles artifact");
      return cacheAndReturnLayerResult(layerId, propertyFilter, {
        layer: {
          ...layer,
          default_view: defaultView,
          geometry_types: dataset.geometry_types ?? layer.geometry_types,
          geometry_type: dataset.geometry_type ?? layer.geometry_type,
          geometryTypes: normalizeGeometryTypes(dataset.geometry_types, dataset.geometry_type ?? layer.geometry_type ?? "mixed"),
        },
        datasets,
        geojson: null,
        tilesUrl: dataset.artifact_url,
        sourceLayerId: dataset.source_layer ?? DEFAULT_PMTILES_SOURCE_LAYER,
        bounds: Array.isArray(dataset.bounds) ? dataset.bounds : null,
      });
    }

    if (dataset?.render_format === "geojson" && dataset?.artifact_url) {
      onProgress?.(45, "Fetching GeoJSON artifact");
      const geojson = await loadGeojsonArtifact(dataset.artifact_url);
      onProgress?.(62, `Loaded ${(geojson?.features?.length ?? 0).toLocaleString()} features`);
      return cacheAndReturnLayerResult(layerId, propertyFilter, {
        layer: {
          ...layer,
          default_view: defaultView,
          geometryTypes: normalizeGeometryTypes(layer.geometry_types, layer.geometry_type ?? "mixed"),
        },
        datasets,
        geojson,
        tilesUrl: null,
      });
    }
  }

  if (datasets.some((dataset) => dataset.render_format === "pmtiles" && dataset.artifact_url)) {
    onProgress?.(40, "Multiple tile datasets found; falling back to merged GeoJSON");
    console.warn("Layer has multiple datasets, so loader is falling back to merged GeoJSON instead of per-dataset PMTiles.");
  }

  if ((layer.feature_count ?? 0) > MAX_GEOJSON_FEATURES) {
    onProgress?.(60, "Layer is too large for merged GeoJSON");
    const loadWarning = createLayerLoadWarning(
      "too_many_features_for_geojson",
      `${layer.name || "This layer"} has ${layer.feature_count} features, which is too large to load as merged GeoJSON.`,
      {
        featureCount: layer.feature_count,
        maxGeojsonFeatures: MAX_GEOJSON_FEATURES,
      },
    );
    console.warn(`${loadWarning.message} Re-upload with tile generation enabled or load a smaller filtered dataset.`);
    return cacheAndReturnLayerResult(layerId, propertyFilter, {
      layer: {
        ...layer,
        default_view: defaultView,
        geometryTypes: normalizeGeometryTypes(layer.geometry_types, layer.geometry_type ?? "mixed"),
      },
      datasets,
      geojson: null,
      tilesUrl: null,
      loadWarning,
    });
  }

  onProgress?.(45, "Loading merged GeoJSON");
  const { data: geojson, error: geojsonError } = await supabase.rpc("get_layer_geojson", { p_layer_id: layerId });
  if (geojsonError) throw new Error(`Failed to load features: ${geojsonError.message}`);
  onProgress?.(62, `Loaded ${(geojson?.features?.length ?? 0).toLocaleString()} features`);

  return cacheAndReturnLayerResult(layerId, propertyFilter, {
    layer: {
      ...layer,
      default_view: defaultView,
      geometryTypes: normalizeGeometryTypes(layer.geometry_types, layer.geometry_type ?? "mixed"),
    },
    datasets,
    geojson,
    tilesUrl: null,
  });
}
