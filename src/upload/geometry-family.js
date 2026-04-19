function geometryTypeToFamily(type) {
  if (type === "Point" || type === "MultiPoint") return "point";
  if (type === "LineString" || type === "MultiLineString") return "line";
  if (type === "Polygon" || type === "MultiPolygon") return "polygon";
  return null;
}

function inferGeometryFamilies(features = []) {
  const families = new Set(
    features
      .map((feature) => geometryTypeToFamily(feature?.geometry?.type))
      .filter(Boolean),
  );

  return ["point", "line", "polygon"].filter((family) => families.has(family));
}

function inferGeometryFamily(features = []) {
  const families = inferGeometryFamilies(features);
  if (families.length === 1) {
    return families[0];
  }
  if (families.length > 1) {
    return "mixed";
  }
  return "mixed";
}

export {
  geometryTypeToFamily,
  inferGeometryFamilies,
  inferGeometryFamily,
};
