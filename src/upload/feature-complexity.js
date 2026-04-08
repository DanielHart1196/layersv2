function countGeometryVertices(geometry) {
  if (!geometry) return 0;

  switch (geometry.type) {
    case "Point":
      return 1;
    case "MultiPoint":
    case "LineString":
      return geometry.coordinates.length;
    case "MultiLineString":
    case "Polygon":
      return geometry.coordinates.reduce((sum, ring) => sum + ring.length, 0);
    case "MultiPolygon":
      return geometry.coordinates.reduce(
        (sum, polygon) => sum + polygon.reduce((polygonSum, ring) => polygonSum + ring.length, 0),
        0,
      );
    case "GeometryCollection":
      return geometry.geometries.reduce((sum, child) => sum + countGeometryVertices(child), 0);
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
    featureCount >= 5000
    || vertexCount >= 50000
    || (hasPolygon && (featureCount >= 750 || vertexCount >= 20000))
    || (hasLine && (featureCount >= 1500 || vertexCount >= 30000));

  let recommendationReason = "PMTiles are optional for this dataset.";
  if (recommendPmtiles) {
    if (vertexCount >= 50000) {
      recommendationReason = "Recommended because this dataset has a lot of geometry detail.";
    } else if (featureCount >= 5000) {
      recommendationReason = "Recommended because this dataset has many features.";
    } else if (hasPolygon) {
      recommendationReason = "Recommended because polygon datasets benefit from tiled rendering.";
    } else if (hasLine) {
      recommendationReason = "Recommended because dense linework benefits from tiled rendering.";
    }
  }

  return {
    featureCount,
    geometryTypes: [...geometryTypes],
    vertexCount,
    recommendPmtiles,
    recommendationReason,
  };
}

export { summarizeFeatureComplexity };
