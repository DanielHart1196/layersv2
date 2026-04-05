import { PRIMARY_KEY, loadStoredCollection, saveStoredCollection } from "./indexeddb.js";
import { parseImportedFile } from "./importers.js";

function createEmptyCollection() {
  return {
    id: PRIMARY_KEY,
    label: "Runtime Editable Features",
    persistence: "indexeddb",
    acceptedImports: ["gpx", "geojson"],
    imports: [],
    featureCounts: {
      points: 0,
      lines: 0,
      areas: 0,
      features: 0,
    },
    lastImportedAt: null,
  };
}

function sumFeatureCounts(imports = []) {
  return imports.reduce((totals, entry) => ({
    points: totals.points + (entry.featureCounts?.points ?? 0),
    lines: totals.lines + (entry.featureCounts?.lines ?? 0),
    areas: totals.areas + (entry.featureCounts?.areas ?? 0),
    features: totals.features + (entry.featureCounts?.features ?? 0),
  }), {
    points: 0,
    lines: 0,
    areas: 0,
    features: 0,
  });
}

function createEditableRuntimeStore() {
  let collection = createEmptyCollection();
  const listeners = new Set();

  function notify() {
    listeners.forEach((listener) => listener(getCollections()));
  }

  function rebuildCollection(nextCollection) {
    collection = {
      ...createEmptyCollection(),
      ...nextCollection,
      imports: Array.isArray(nextCollection?.imports) ? nextCollection.imports : [],
    };
    collection.featureCounts = sumFeatureCounts(collection.imports);
    collection.lastImportedAt = collection.imports[0]?.importedAt ?? null;
  }

  async function initialize() {
    try {
      const stored = await loadStoredCollection();
      if (stored) {
        rebuildCollection(stored);
        notify();
      }
    } catch (_error) {
      rebuildCollection(collection);
    }
  }

  function getCollections() {
    return [structuredClone(collection)];
  }

  async function persist() {
    await saveStoredCollection(collection);
  }

  async function importFiles(files) {
    const fileList = Array.from(files ?? []);
    if (!fileList.length) {
      return [];
    }

    const parsedImports = [];
    for (const file of fileList) {
      const parsed = await parseImportedFile(file);
      parsedImports.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: parsed.name,
        format: parsed.format,
        importedAt: new Date().toISOString(),
        featureCounts: parsed.featureCounts,
        featureCollection: parsed.featureCollection,
      });
    }

    rebuildCollection({
      ...collection,
      imports: [...parsedImports, ...collection.imports],
    });
    await persist();
    notify();
    return parsedImports;
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return {
    getCollections,
    importFiles,
    initialize,
    subscribe,
  };
}

export { createEditableRuntimeStore };
