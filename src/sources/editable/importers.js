function normalizeFeatureCollection(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Unsupported import payload.");
  }

  if (input.type === "FeatureCollection" && Array.isArray(input.features)) {
    return input;
  }

  if (input.type === "Feature") {
    return {
      type: "FeatureCollection",
      features: [input],
    };
  }

  if (input.type && input.coordinates) {
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: input,
        },
      ],
    };
  }

  throw new Error("Import payload is not valid GeoJSON.");
}

function countGeometry(geometry, counts) {
  if (!geometry) {
    return;
  }

  switch (geometry.type) {
    case "Point":
    case "MultiPoint":
      counts.points += Array.isArray(geometry.coordinates?.[0]) ? geometry.coordinates.length : 1;
      break;
    case "LineString":
    case "MultiLineString":
      counts.lines += 1;
      break;
    case "Polygon":
    case "MultiPolygon":
      counts.areas += 1;
      break;
    case "GeometryCollection":
      geometry.geometries?.forEach((entry) => countGeometry(entry, counts));
      break;
    default:
      break;
  }
}

function getFeatureCounts(featureCollection) {
  const counts = {
    points: 0,
    lines: 0,
    areas: 0,
    features: 0,
  };

  featureCollection.features.forEach((feature) => {
    counts.features += 1;
    countGeometry(feature?.geometry, counts);
  });

  return counts;
}

function parseGeoJsonText(text) {
  const parsed = JSON.parse(text);
  const featureCollection = normalizeFeatureCollection(parsed);
  return {
    format: "geojson",
    featureCollection,
    featureCounts: getFeatureCounts(featureCollection),
  };
}

function extractTextContent(node, tagName) {
  return node.getElementsByTagName(tagName)[0]?.textContent?.trim?.() ?? "";
}

function parseCoordinateNode(node, lonTag = "lon", latTag = "lat") {
  const lon = Number(node.getAttribute(lonTag));
  const lat = Number(node.getAttribute(latTag));
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return null;
  }
  return [lon, lat];
}

function parseGpxText(text) {
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(text, "application/xml");
  const parserError = documentNode.querySelector("parsererror");
  if (parserError) {
    throw new Error("GPX parse failed.");
  }

  const features = [];

  Array.from(documentNode.getElementsByTagName("wpt")).forEach((wpt) => {
    const coordinates = parseCoordinateNode(wpt);
    if (!coordinates) {
      return;
    }
    features.push({
      type: "Feature",
      properties: {
        name: extractTextContent(wpt, "name"),
      },
      geometry: {
        type: "Point",
        coordinates,
      },
    });
  });

  Array.from(documentNode.getElementsByTagName("rte")).forEach((route) => {
    const coordinates = Array.from(route.getElementsByTagName("rtept"))
      .map((node) => parseCoordinateNode(node))
      .filter(Boolean);
    if (coordinates.length < 2) {
      return;
    }
    features.push({
      type: "Feature",
      properties: {
        name: extractTextContent(route, "name"),
      },
      geometry: {
        type: "LineString",
        coordinates,
      },
    });
  });

  Array.from(documentNode.getElementsByTagName("trk")).forEach((track) => {
    const segments = Array.from(track.getElementsByTagName("trkseg"))
      .map((segment) => Array.from(segment.getElementsByTagName("trkpt"))
        .map((node) => parseCoordinateNode(node))
        .filter(Boolean))
      .filter((segment) => segment.length >= 2);

    if (!segments.length) {
      return;
    }

    const geometry = segments.length === 1
      ? { type: "LineString", coordinates: segments[0] }
      : { type: "MultiLineString", coordinates: segments };

    features.push({
      type: "Feature",
      properties: {
        name: extractTextContent(track, "name"),
      },
      geometry,
    });
  });

  const featureCollection = {
    type: "FeatureCollection",
    features,
  };

  return {
    format: "gpx",
    featureCollection,
    featureCounts: getFeatureCounts(featureCollection),
  };
}

async function parseImportedFile(file) {
  const name = String(file?.name ?? "import");
  const lowercaseName = name.toLowerCase();
  const text = await file.text();

  if (lowercaseName.endsWith(".gpx")) {
    return {
      name,
      ...parseGpxText(text),
    };
  }

  if (
    lowercaseName.endsWith(".geojson")
    || lowercaseName.endsWith(".json")
  ) {
    return {
      name,
      ...parseGeoJsonText(text),
    };
  }

  throw new Error(`Unsupported import type for ${name}.`);
}

export { parseImportedFile };
