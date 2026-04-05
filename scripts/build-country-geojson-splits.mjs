import fs from "node:fs";
import path from "node:path";

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SOURCE_PATH = path.join(ROOT_DIR, "public", "data", "external-countries.geojson");
const OUTPUT_DIR = path.join(ROOT_DIR, "public", "data", "countries");
const INDEX_PATH = path.join(OUTPUT_DIR, "index.json");

function sanitizeSlug(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function normalizeIsoCode(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{2,3}$/.test(normalized) ? normalized : null;
}

function readSource() {
  return JSON.parse(fs.readFileSync(SOURCE_PATH, "utf8"));
}

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function buildCountryGroups(featureCollection) {
  const groups = new Map();

  for (const feature of featureCollection.features ?? []) {
    const properties = feature?.properties ?? {};
    const alpha3 = normalizeIsoCode(properties["ISO3166-1-Alpha-3"]);
    const alpha2 = normalizeIsoCode(properties["ISO3166-1-Alpha-2"]);
    const name = String(properties.name ?? "").trim();
    const key = alpha3 || alpha2 || sanitizeSlug(name);

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        alpha3: alpha3 || null,
        alpha2: alpha2 || null,
        name: name || key,
        features: [],
      });
    }

    groups.get(key).features.push(feature);
  }

  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function writeCountryFiles(groups) {
  const index = [];

  for (const group of groups) {
    const slugBase = group.alpha3?.toLowerCase() || group.alpha2?.toLowerCase() || sanitizeSlug(group.name);
    const filename = `${slugBase}.geojson`;
    const countryFeatureCollection = {
      type: "FeatureCollection",
      features: group.features,
    };

    fs.writeFileSync(
      path.join(OUTPUT_DIR, filename),
      JSON.stringify(countryFeatureCollection),
    );

    index.push({
      id: slugBase,
      name: group.name,
      alpha2: group.alpha2,
      alpha3: group.alpha3,
      featureCount: group.features.length,
      url: `/data/countries/${filename}`,
    });
  }

  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
  return index;
}

ensureOutputDir();
const source = readSource();
const groups = buildCountryGroups(source);
const index = writeCountryFiles(groups);

console.log(`Built ${index.length} country GeoJSON files in ${OUTPUT_DIR}`);
