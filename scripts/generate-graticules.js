import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const outputPath = path.join(cwd, "public/data/graticules/world-graticules-10deg.geojson");
const STEP_DEGREES = 10;
const POLAR_MERIDIAN_STEP = 90;
const POLAR_BREAK_LATITUDE = 80;
const SAMPLE_STEP = 1;

function buildMeridian(longitude) {
  const coordinates = [];
  for (let latitude = -90; latitude <= 90; latitude += SAMPLE_STEP) {
    coordinates.push([longitude, latitude]);
  }

  return {
    type: "Feature",
    properties: {
      axis: "longitude",
      value: longitude,
      label: `${Math.abs(longitude)}°${longitude < 0 ? "W" : longitude > 0 ? "E" : ""}`,
      major: longitude % 90 === 0,
      prime: longitude === 0,
    },
    geometry: {
      type: "LineString",
      coordinates,
    },
  };
}

function buildSegmentedMeridian(longitude, minLatitude, maxLatitude, properties = {}) {
  const coordinates = [];
  for (let latitude = minLatitude; latitude <= maxLatitude; latitude += SAMPLE_STEP) {
    coordinates.push([longitude, latitude]);
  }

  return {
    type: "Feature",
    properties: {
      axis: "longitude",
      value: longitude,
      ...properties,
    },
    geometry: {
      type: "LineString",
      coordinates,
    },
  };
}

function buildParallel(latitude) {
  const coordinates = [];
  for (let longitude = -180; longitude <= 180; longitude += SAMPLE_STEP) {
    coordinates.push([longitude, latitude]);
  }

  return {
    type: "Feature",
    properties: {
      axis: "latitude",
      value: latitude,
      label: `${Math.abs(latitude)}°${latitude < 0 ? "S" : latitude > 0 ? "N" : ""}`,
      major: latitude % 45 === 0,
      equator: latitude === 0,
    },
    geometry: {
      type: "LineString",
      coordinates,
    },
  };
}

const features = [];

for (let longitude = -180; longitude <= 180; longitude += STEP_DEGREES) {
  features.push(buildSegmentedMeridian(longitude, -POLAR_BREAK_LATITUDE, POLAR_BREAK_LATITUDE, {
    label: `${Math.abs(longitude)}°${longitude < 0 ? "W" : longitude > 0 ? "E" : ""}`,
    major: longitude % 90 === 0,
    prime: longitude === 0,
    polar: false,
  }));
}

for (let longitude = -180; longitude <= 180; longitude += POLAR_MERIDIAN_STEP) {
  features.push(buildSegmentedMeridian(longitude, -90, -POLAR_BREAK_LATITUDE, {
    label: `${Math.abs(longitude)}°${longitude < 0 ? "W" : longitude > 0 ? "E" : ""}`,
    major: true,
    prime: longitude === 0,
    polar: true,
  }));
  features.push(buildSegmentedMeridian(longitude, POLAR_BREAK_LATITUDE, 90, {
    label: `${Math.abs(longitude)}°${longitude < 0 ? "W" : longitude > 0 ? "E" : ""}`,
    major: true,
    prime: longitude === 0,
    polar: true,
  }));
}

for (let latitude = -POLAR_BREAK_LATITUDE; latitude <= POLAR_BREAK_LATITUDE; latitude += STEP_DEGREES) {
  features.push(buildParallel(latitude));
}

const output = {
  type: "FeatureCollection",
  metadata: {
    generatedBy: "scripts/generate-graticules.js",
    intervalDegrees: STEP_DEGREES,
    polarMeridianStepDegrees: POLAR_MERIDIAN_STEP,
    polarBreakLatitude: POLAR_BREAK_LATITUDE,
    sampleStepDegrees: SAMPLE_STEP,
    notes: [
      "Matches the old app's D3 geoGraticule10-style geometry contract.",
      "10° parallels and meridians through ±80°, with 90° meridians in the polar caps.",
    ],
  },
  features,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

console.log(JSON.stringify({
  outputPath,
  featureCount: features.length,
  meridianCount: features.filter((feature) => feature.properties.axis === "longitude").length,
  parallelCount: features.filter((feature) => feature.properties.axis === "latitude").length,
}, null, 2));
