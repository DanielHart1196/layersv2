import { LOCAL_LAYERS } from "../config/local-layers.js";

function localEntries() {
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

function groupEntries(entries) {
  const groups = {};
  for (const entry of entries) {
    if (!groups[entry.group]) groups[entry.group] = [];
    groups[entry.group].push(entry);
  }
  return groups;
}

// Sync — local layers only. Used for the initial render before Supabase responds.
export function getLayerCatalog() {
  return localEntries();
}

export function getLayerCatalogByGroup() {
  return groupEntries(localEntries());
}

// Async — merges local + Supabase public/unlisted layers.
export async function getFullCatalogByGroup() {
  const { getSupabaseCatalog } = await import("../sources/supabase/layer-loader.js");
  const [supabaseEntries] = await Promise.allSettled([getSupabaseCatalog()]);
  const remote = supabaseEntries.status === "fulfilled" ? supabaseEntries.value : [];
  return groupEntries([...localEntries(), ...remote]);
}
