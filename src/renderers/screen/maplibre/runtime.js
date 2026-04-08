import { createMapInstance, isRealPmtilesUrl } from "./map-instance.js";

function getUniqueRoles(manifest) {
  return [...new Set((manifest ?? []).map((entry) => entry.role).filter(Boolean))];
}

function validatePmtilesManifest(manifest) {
  const errors = [];
  const warnings = [];
  const ids = new Set();

  (manifest ?? []).forEach((source, index) => {
    if (!source?.id) {
      errors.push(`pmtiles-source-${index}-missing-id`);
    } else if (ids.has(source.id)) {
      errors.push(`pmtiles-source-${source.id}-duplicate-id`);
    } else {
      ids.add(source.id);
    }

    if (source?.kind !== "pmtiles") {
      errors.push(`${source?.id ?? `pmtiles-source-${index}`}-invalid-kind`);
    }

    if (!Array.isArray(source?.layers) || source.layers.length === 0) {
      warnings.push(`${source?.id ?? `pmtiles-source-${index}`}-missing-layer-list`);
    }

    if (!String(source?.url ?? "").endsWith(".pmtiles")) {
      warnings.push(`${source?.id ?? `pmtiles-source-${index}`}-url-not-pmtiles`);
    }
  });

  return {
    errors,
    warnings,
    valid: errors.length === 0,
  };
}

function createMaplibreScreenRuntime({
  pmtilesManifest = [],
  viewState = null,
  initialLayerState = {},
  getRuntimeVectors = () => [],
} = {}) {
  let mapInstance = null;
  const dependencyState = {
    maplibreInstalled: true,
    pmtilesInstalled: true,
  };
  const manifestCheck = validatePmtilesManifest(pmtilesManifest);
  const roles = getUniqueRoles(pmtilesManifest);
  const readyPmtilesSources = (pmtilesManifest ?? []).filter((source) => isRealPmtilesUrl(source.url));

  function getStatus() {
    return {
      renderer: "maplibre-screen-adapter",
      targetProjection: viewState?.projectionId ?? "globe",
      sourceCount: pmtilesManifest.length,
      readyPmtilesSourceCount: readyPmtilesSources.length,
      sourceRoles: roles,
      editableCollectionCount: getRuntimeVectors().length,
      dependencyState: structuredClone(dependencyState),
      manifestCheck,
      startupMode: readyPmtilesSources.length > 0
        ? "ready-for-live-pmtiles-map"
        : dependencyState.maplibreInstalled && dependencyState.pmtilesInstalled
          ? "live-map-running-without-real-pmtiles"
          : "scaffold-awaiting-runtime-deps",
      mapMode: readyPmtilesSources.length > 0
        ? "pmtiles-basemap"
        : "empty-globe-shell",
      liveMap: dependencyState.maplibreInstalled && dependencyState.pmtilesInstalled,
      nextActions: readyPmtilesSources.length > 0
        ? [
            "map can now attach live PMTiles-backed sources",
            "add runtime editable overlay source",
            "bind user layer style contracts",
          ]
        : dependencyState.maplibreInstalled && dependencyState.pmtilesInstalled
          ? [
              "replace placeholder source URLs with real archives",
              "map shell is live and ready for PMTiles source binding",
              "add runtime editable overlay source",
            ]
            : [
              "install maplibre-gl",
              "install pmtiles",
              "replace placeholder source URLs with real archives",
            ],
    };
  }

  function mount(container) {
    if (!container || mapInstance) {
      return;
    }

    container.parentElement?.classList?.add("has-live-map");
    mapInstance = createMapInstance({
      container,
      manifest: pmtilesManifest,
      viewState,
      initialLayerState,
    });
  }

  function destroy() {
    mapInstance?.destroy?.();
    mapInstance = null;
  }

  function renderStage(container) {
    if (!container) {
      return;
    }
    container.innerHTML = "";
  }

  return {
    destroy,
    getStatus,
    mount,
    renderStage,
    reorderLayerGroup(parentId, orderedLayerIds) {
      mapInstance?.reorderLayerGroup?.(parentId, orderedLayerIds);
    },
    setLayerStyleValue(layerId, key, value) {
      mapInstance?.setLayerStyleValue?.(layerId, key, value);
    },
    loadDynamicLayer({ layerId, geojson, tilesUrl, style }) {
      mapInstance?.attachDynamicLayer?.(layerId, geojson, tilesUrl, style);
    },
    detachDynamicLayer(layerId) {
      mapInstance?.detachDynamicLayer?.(layerId);
    },
  };
}

export { createMaplibreScreenRuntime };
