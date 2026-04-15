function geometryTypeToFamily(type) {
  if (type === "Point" || type === "MultiPoint") return "point";
  if (type === "LineString" || type === "MultiLineString") return "line";
  if (type === "Polygon" || type === "MultiPolygon") return "polygon";
  return null;
}

function inferGeometryFamily(features = []) {
  const families = new Set(
    features
      .map((feature) => geometryTypeToFamily(feature?.geometry?.type))
      .filter(Boolean),
  );

  if (families.size === 1) {
    return [...families][0];
  }

  if (families.size > 1) {
    return "mixed";
  }

  return "mixed";
}

export {
  geometryTypeToFamily,
  inferGeometryFamily,
};
