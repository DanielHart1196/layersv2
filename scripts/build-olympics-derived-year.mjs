import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const year = Number(process.argv[2] ?? 1904);
const pageTitle = `List_of_${year}_Summer_Olympics_medal_winners`;
const pageUrl = `https://en.wikipedia.org/wiki/${pageTitle}`;
const outputDir = path.join(root, "data", "sources", "olympics-derived", String(year));
const userAgent = "Layers/1.0 (Olympics birthplace data research)";

if (!Number.isInteger(year) || year < 1896 || year > 2100) throw new Error(`Invalid year: ${process.argv[2]}`);

const cleanText = (value = "") => value.replace(/\[[^\]]*]/g, "").replace(/\s+/g, " ").trim();
const claimValue = (entity, property) => entity?.claims?.[property]?.[0]?.mainsnak?.datavalue?.value ?? null;
const claimId = (entity, property) => claimValue(entity, property)?.id ?? null;
const claimIds = (entity, property) => (entity?.claims?.[property] ?? []).map((claim) => claim.mainsnak?.datavalue?.value?.id).filter(Boolean);
const claimString = (entity, property) => typeof claimValue(entity, property) === "string" ? claimValue(entity, property) : null;
const label = (entity, fallback = null) => entity?.labels?.en?.value ?? fallback;

function normalizeHref(href = "") {
  if (typeof href !== "string") return null;
  const clean = href.split("#")[0].split("?")[0];
  if (clean.startsWith("./")) return `/wiki/${clean.slice(2)}`;
  return clean.startsWith("/wiki/") ? clean : null;
}

function titleFromHref(href) {
  const normalized = normalizeHref(href);
  return normalized ? decodeURIComponent(normalized.slice(6)).replaceAll("_", " ") : null;
}

function fullUrl(href) {
  const normalized = normalizeHref(href);
  return normalized ? `https://en.wikipedia.org${normalized}` : null;
}

function chunks(values, size = 50) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function request(url, json = true, attempt = 0) {
  const response = await fetch(url, { headers: { "User-Agent": userAgent } });
  if ((response.status === 429 || response.status >= 500) && attempt < 5) {
    const retryAfter = Number(response.headers.get("retry-after"));
    const delay = Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000 * (2 ** attempt);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return request(url, json, attempt + 1);
  }
  if (!response.ok) throw new Error(`Request failed (${response.status}): ${url}`);
  return json ? response.json() : response.text();
}

async function resolveTitles(titles) {
  const result = new Map();
  for (const group of chunks([...new Set(titles.filter(Boolean))])) {
    const query = new URLSearchParams({ action: "query", format: "json", formatversion: "2", redirects: "1", prop: "pageprops", ppprop: "wikibase_item", titles: group.join("|"), origin: "*" });
    const payload = await request(`https://en.wikipedia.org/w/api.php?${query}`);
    const redirects = new Map((payload.query?.redirects ?? []).map((entry) => [entry.from, entry.to]));
    const pages = new Map((payload.query?.pages ?? []).map((page) => [page.title, page]));
    group.forEach((title) => result.set(title, pages.get(redirects.get(title) ?? title)?.pageprops?.wikibase_item ?? null));
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return result;
}

async function loadEntities(ids) {
  const result = new Map();
  for (const group of chunks([...new Set(ids.filter(Boolean))])) {
    const query = new URLSearchParams({ action: "wbgetentities", format: "json", ids: group.join("|"), props: "labels|claims", languages: "en", languagefallback: "1", origin: "*" });
    const payload = await request(`https://www.wikidata.org/w/api.php?${query}`);
    Object.entries(payload.entities ?? {}).forEach(([id, entity]) => result.set(id, entity));
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return result;
}

function point(entity) {
  const value = claimValue(entity, "P625");
  return value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude) ? { lat: value.latitude, lon: value.longitude } : null;
}

function date(entity) {
  const value = claimValue(entity, "P569")?.time;
  return typeof value === "string" ? value.replace(/^\+/, "").slice(0, 10) : null;
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows) {
  const columns = rows.length ? Object.keys(rows[0]) : [];
  return `${columns.join(",")}\n${rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")).join("\n")}\n`;
}

const htmlEndpoint = `https://en.wikipedia.org/api/rest_v1/page/html/${pageTitle}`;
const $ = load(await request(htmlEndpoint, false));
const medalCells = [];

$("table.wikitable").each((tableIndex, table) => {
  const headers = $(table).find("tr").first().children("th,td").map((_, cell) => cleanText($(cell).text())).get();
  const medalIndexes = ["Gold", "Silver", "Bronze"].map((medal) => headers.indexOf(medal));
  if (medalIndexes.some((index) => index < 0)) return;
  const sport = cleanText($(table).prevAll("h2").first().text());
  $(table).find("tr").slice(1).each((rowIndex, row) => {
    const cells = $(row).children("th,td").toArray();
    const eventIndex = headers.indexOf("Event");
    const eventCell = eventIndex >= 0 ? cells[eventIndex] : null;
    const eventLink = eventCell ? $(eventCell).find("a").toArray().find((link) => normalizeHref($(link).attr("href"))?.includes(`_at_the_${year}_Summer_Olympics`)) : null;
    const eventName = eventCell ? cleanText($(eventCell).text().replace(/details$/i, "")) : sport;
    ["gold", "silver", "bronze"].forEach((medal, offset) => {
      const cell = cells[medalIndexes[offset]];
      if (!cell || /none awarded/i.test(cleanText($(cell).text()))) return;
      const links = $(cell).find("a").toArray().map((link) => ({ href: normalizeHref($(link).attr("href")), text: cleanText($(link).text()) })).filter((link) => link.href);
      const delegation = links.find((link) => link.href.includes(`_at_the_${year}_Summer_Olympics`)) ?? null;
      medalCells.push({ tableIndex, rowIndex, sport, eventName, medal, rawText: cleanText($(cell).text()), eventHref: eventLink ? normalizeHref($(eventLink).attr("href")) : null, delegationHref: delegation?.href ?? null, delegationText: delegation?.text ?? null, candidates: links.filter((link) => !link.href.includes(`_at_the_${year}_Summer_Olympics`) && !link.href.includes("List_of_") && !link.href.includes("Summer_Olympics_medal")) });
    });
  });
});

const titles = medalCells.flatMap((cell) => [titleFromHref(cell.eventHref), titleFromHref(cell.delegationHref), ...cell.candidates.map((link) => titleFromHref(link.href))]);
const titleQids = await resolveTitles(titles);
const firstEntities = await loadEntities([...titleQids.values()]);
const medalRows = [];
const unresolvedCells = [];

for (const cell of medalCells) {
  const athletes = cell.candidates.filter((candidate) => claimIds(firstEntities.get(titleQids.get(titleFromHref(candidate.href))), "P31").includes("Q5"));
  if (!athletes.length) unresolvedCells.push({ ...cell, candidates: cell.candidates.map((candidate) => candidate.href) });
  athletes.forEach((athlete) => medalRows.push({ ...cell, athleteHref: athlete.href, athleteText: athlete.text, athleteQid: titleQids.get(titleFromHref(athlete.href)), eventQid: titleQids.get(titleFromHref(cell.eventHref)), delegationQid: titleQids.get(titleFromHref(cell.delegationHref)) }));
}

const relatedIds = medalRows.flatMap((row) => {
  const athlete = firstEntities.get(row.athleteQid);
  const event = firstEntities.get(row.eventQid);
  const delegation = firstEntities.get(row.delegationQid);
  return [claimId(athlete, "P19"), row.eventQid, claimId(event, "P641"), claimId(event, "P361"), row.delegationQid, claimId(delegation, "P17"), claimId(athlete, "P21")];
});
const secondEntities = await loadEntities(relatedIds);
const parentIds = [...secondEntities.values()].map((entity) => claimId(entity, "P131")).filter(Boolean);
const entities = new Map([...firstEntities, ...secondEntities, ...await loadEntities(parentIds)]);

const records = medalRows.map((row) => {
  const athlete = entities.get(row.athleteQid);
  const placeId = claimId(athlete, "P19");
  const place = entities.get(placeId);
  const placeParentId = claimId(place, "P131");
  const event = entities.get(row.eventQid);
  const sportId = claimId(event, "P641");
  const eventGroupId = claimId(event, "P361");
  const delegation = entities.get(row.delegationQid);
  const countryId = claimId(delegation, "P17") ?? row.delegationQid;
  const country = entities.get(countryId);
  const sexId = claimId(athlete, "P21");
  const coordinates = point(place);
  return { year, medalist_wikidata_id: row.athleteQid, medalist_link: fullUrl(row.athleteHref), medalist_name: label(athlete, row.athleteText), medal: row.medal, delegation_wikidata_id: row.delegationQid, delegation_link: fullUrl(row.delegationHref), delegation_name: label(delegation, row.delegationText), country_medal_wikidata_id: countryId, country_medal: label(country, row.delegationText), country_medal_code2: claimString(country, "P297"), country_medal_code3: claimString(country, "P298"), country_medal_ioc_country_code: claimString(country, "P984"), date_of_birth: date(athlete), place_of_birth_wikidata_id: placeId, place_of_birth: label(place), place_of_birth_located_in_wikidata_id: placeParentId, place_of_birth_located_in: label(entities.get(placeParentId)), place_of_birth_coordinates: coordinates ? `${coordinates.lat},${coordinates.lon}` : null, lat: coordinates?.lat ?? null, lon: coordinates?.lon ?? null, sex_or_gender_wikidata_id: sexId, sex_or_gender: label(entities.get(sexId)), event_wikidata_id: row.eventQid, event_link: fullUrl(row.eventHref), event_name: label(event, row.eventName), event_part_of_wikidata_id: eventGroupId, event_part_of: label(entities.get(eventGroupId)), event_sport_wikidata_id: sportId, event_sport: label(entities.get(sportId), row.sport), sport_wikidata_id: sportId, sport: label(entities.get(sportId), row.sport), source_page: pageUrl, source_kind: "layers-derived-wikipedia-wikidata" };
});

const mapped = records.filter((record) => Number.isFinite(record.lat) && Number.isFinite(record.lon));
const geojson = { type: "FeatureCollection", features: mapped.map((record) => ({ type: "Feature", id: `olympic-medals-birthplace-${year}-${crypto.createHash("sha256").update(`${record.medalist_wikidata_id}|${record.event_wikidata_id}|${record.medal}`).digest("hex").slice(0, 16)}`, geometry: { type: "Point", coordinates: [record.lon, record.lat] }, properties: Object.fromEntries(Object.entries(record).filter(([key]) => key !== "lat" && key !== "lon")) })) };
const diagnostics = { year, generatedAt: new Date().toISOString(), sourcePage: pageUrl, sourceRevisionEndpoint: htmlEndpoint, sourceKind: "layers-derived-wikipedia-wikidata", parsedMedalCells: medalCells.length, athleteMedalRecords: records.length, mappedAthleteMedalRecords: mapped.length, missingBirthplaceCoordinates: records.length - mapped.length, unresolvedMedalCells: unresolvedCells.length, medals: records.reduce((counts, record) => ({ ...counts, [record.medal]: (counts[record.medal] ?? 0) + 1 }), {}), unresolvedCells };

await fs.mkdir(outputDir, { recursive: true });
await Promise.all([fs.writeFile(path.join(outputDir, `${year}_medalists_all.csv`), toCsv(records)), fs.writeFile(path.join(outputDir, `${year}_medalists_birthplace.geojson`), `${JSON.stringify(geojson)}\n`), fs.writeFile(path.join(outputDir, `${year}_diagnostics.json`), `${JSON.stringify(diagnostics, null, 2)}\n`)]);
console.log(JSON.stringify(diagnostics, null, 2));
