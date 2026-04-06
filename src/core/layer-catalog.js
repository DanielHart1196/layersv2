import { LOCAL_LAYERS } from "../config/local-layers.js";

// Returns all layers available to reference in a row.
// Groups entries by their group so the UI can render a grouped select.
// Later this will also merge in Supabase-hosted layers.
export function getLayerCatalog() {
  return LOCAL_LAYERS.map((l) => ({
    id: l.id,
    label: l.label,
    group: l.group ?? "other",
    geometryType:
      l.fill && l.line ? "polygon+line"
      : l.fill          ? "polygon"
      :                   "line",
  }));
}

// Returns catalog entries grouped as { [group]: [entry, ...] }
export function getLayerCatalogByGroup() {
  const catalog = getLayerCatalog();
  const groups = {};
  for (const entry of catalog) {
    if (!groups[entry.group]) groups[entry.group] = [];
    groups[entry.group].push(entry);
  }
  return groups;
}
