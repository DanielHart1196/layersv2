const PMTILES_FEATURE_THRESHOLD = 2500;
const PMTILES_VERTEX_THRESHOLD = 50000;

function countGeometryVertices(geometry) {
  if (!geometry) return 0;
  const coordinates = geometry.coordinates;

  switch (geometry.type) {
    case "Point":
      return 1;
    case "MultiPoint":
    case "LineString":
      return Array.isArray(coordinates) ? coordinates.length : 0;
    case "MultiLineString":
    case "Polygon":
      return Array.isArray(coordinates)
        ? coordinates.reduce((sum, ring) => sum + (Array.isArray(ring) ? ring.length : 0), 0)
        : 0;
    case "MultiPolygon":
      return Array.isArray(coordinates)
        ? coordinates.reduce(
          (sum, polygon) => sum + (Array.isArray(polygon)
            ? polygon.reduce((polygonSum, ring) => polygonSum + (Array.isArray(ring) ? ring.length : 0), 0)
            : 0),
          0,
        )
        : 0;
    case "GeometryCollection":
      return Array.isArray(geometry.geometries)
        ? geometry.geometries.reduce((sum, child) => sum + countGeometryVertices(child), 0)
        : 0;
    default:
      return 0;
  }
}

function summarizeFeatureComplexity(features = []) {
  const geometryTypes = new Set();
  let featureCount = 0;
  let vertexCount = 0;

  features.forEach((feature) => {
    if (!feature?.geometry) return;
    featureCount += 1;
    geometryTypes.add(feature.geometry.type);
    vertexCount += countGeometryVertices(feature.geometry);
  });

  const hasPolygon = [...geometryTypes].some((type) => type === "Polygon" || type === "MultiPolygon");
  const hasLine = [...geometryTypes].some((type) => type === "LineString" || type === "MultiLineString");

  const recommendPmtiles =
    featureCount >= PMTILES_FEATURE_THRESHOLD
    || vertexCount >= PMTILES_VERTEX_THRESHOLD;

  let recommendationReason = "PMTiles are optional for this dataset.";
  if (recommendPmtiles) {
    if (vertexCount >= PMTILES_VERTEX_THRESHOLD) {
      recommendationReason = "Recommended because this dataset has a lot of geometry detail.";
    } else if (featureCount >= PMTILES_FEATURE_THRESHOLD) {
      recommendationReason = "Recommended because this dataset has many features.";
    }
  } else if (hasPolygon) {
    recommendationReason = "GeoJSON should be fine unless polygon detail grows significantly.";
  } else if (hasLine) {
    recommendationReason = "GeoJSON should be fine unless line detail grows significantly.";
  }

  return {
    featureCount,
    geometryTypes: [...geometryTypes],
    vertexCount,
    recommendPmtiles,
    recommendationReason,
  };
}

export {
  PMTILES_FEATURE_THRESHOLD,
  PMTILES_VERTEX_THRESHOLD,
  summarizeFeatureComplexity,
};
