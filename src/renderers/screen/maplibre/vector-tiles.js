import { GeoJSONVT } from "@maplibre/geojson-vt";
import { fromGeojsonVt } from "@maplibre/vt-pbf";

const DEFAULT_TILE_OPTIONS = {
  buffer: 64,
  extent: 4096,
  indexMaxPoints: 100000,
  indexMaxZoom: 5,
  maxZoom: 6,
  tolerance: 3,
};

const protocolRegistry = new Map();
let protocolInstalled = false;
const emptyTileCache = new Map();

function buildArrayBuffer(view) {
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
}

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load GeoJSON tile source: ${response.status}`);
  }

  return response.json();
}

function getRegistryEntry(id) {
  const entry = protocolRegistry.get(id);
  if (!entry) {
    throw new Error(`Unknown atlas vector tile source: ${id}`);
  }

  if (!entry.tileIndexPromise) {
    const dataPromise = entry.data
      ? Promise.resolve(entry.data)
      : loadJson(entry.dataUrl);
    entry.tileIndexPromise = dataPromise.then((data) => new GeoJSONVT(data, entry.tileOptions));
  }

  return entry;
}

function getEmptyTileBuffer(entry) {
  const cacheKey = `${entry.sourceLayer}:${entry.tileOptions.extent}`;
  if (!emptyTileCache.has(cacheKey)) {
    const encoded = fromGeojsonVt(
      {
        [entry.sourceLayer]: {
          features: [],
        },
      },
      {
        extent: entry.tileOptions.extent,
        version: 2,
      },
    );
    emptyTileCache.set(cacheKey, buildArrayBuffer(encoded));
  }

  return emptyTileCache.get(cacheKey);
}

function installAtlasVectorTileProtocol(maplibregl) {
  if (protocolInstalled) {
    return;
  }

  maplibregl.addProtocol("atlasvt", async (params) => {
    const match = /^atlasvt:\/\/([^/]+)\/(\d+)\/(\d+)\/(\d+)\.pbf$/.exec(params.url);
    if (!match) {
      throw new Error(`Invalid atlas vector tile URL: ${params.url}`);
    }

    const [, sourceId, zText, xText, yText] = match;
    const entry = getRegistryEntry(sourceId);
    const tileIndex = await entry.tileIndexPromise;
    const tile = tileIndex.getTile(Number(zText), Number(xText), Number(yText));

    if (!tile) {
      return { data: getEmptyTileBuffer(entry) };
    }

    const encoded = fromGeojsonVt(
      { [entry.sourceLayer]: tile },
      {
        extent: entry.tileOptions.extent,
        version: 2,
      },
    );

    return {
      data: buildArrayBuffer(encoded),
    };
  });

  protocolInstalled = true;
}

// Call this at idle time to pre-build the GeoJSONVT index so the first real
// tile request doesn't block the main thread building it mid-interaction.
function prewarmTileSource(id) {
  const entry = protocolRegistry.get(id);
  if (!entry || entry.tileIndexPromise) {
    return;
  }

  const dataPromise = entry.data ? Promise.resolve(entry.data) : loadJson(entry.dataUrl);
  entry.tileIndexPromise = dataPromise.then((data) => new GeoJSONVT(data, entry.tileOptions));
}

function registerGeojsonVectorTileSource({
  id,
  dataUrl,
  data,
  sourceLayer,
  tileOptions = {},
} = {}) {
  if (!id || (!dataUrl && !data) || !sourceLayer) {
    throw new Error("GeoJSON vector tile source requires id, sourceLayer, and either dataUrl or data.");
  }

  protocolRegistry.set(id, {
    data,
    dataUrl,
    sourceLayer,
    tileIndexPromise: null,
    tileOptions: {
      ...DEFAULT_TILE_OPTIONS,
      ...tileOptions,
    },
  });
}

function createGeojsonVectorSourceSpec(id, maxZoom = DEFAULT_TILE_OPTIONS.maxZoom) {
  return {
    type: "vector",
    tiles: [`atlasvt://${id}/{z}/{x}/{y}.pbf`],
    minzoom: 0,
    maxzoom: maxZoom,
  };
}

export {
  createGeojsonVectorSourceSpec,
  installAtlasVectorTileProtocol,
  prewarmTileSource,
  registerGeojsonVectorTileSource,
};
