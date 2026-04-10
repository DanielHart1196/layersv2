function humanizeFieldLabel(key) {
  return String(key ?? "")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function isNumericValue(value) {
  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  return trimmed !== "" && /^-?\d+(\.\d+)?$/.test(trimmed);
}

function isBooleanValue(value) {
  if (typeof value === "boolean") {
    return true;
  }

  if (typeof value !== "string") {
    return false;
  }

  return /^(true|false|yes|no|0|1)$/i.test(value.trim());
}

function isDateValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return true;
  }

  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  const looksDateLike = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(trimmed)
    || /^\d{4}-\d{2}-\d{2}T/.test(trimmed)
    || /^\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(trimmed);

  return looksDateLike && !Number.isNaN(Date.parse(trimmed));
}

function inferFieldType(values) {
  const presentValues = values.filter((value) => value !== null && value !== undefined && value !== "");
  if (!presentValues.length) {
    return "text";
  }

  if (presentValues.every(isBooleanValue)) {
    return "boolean";
  }

  if (presentValues.every(isNumericValue)) {
    return "number";
  }

  if (presentValues.every(isDateValue)) {
    return "date";
  }

  return "text";
}

export function inferFieldSchemaFromFeatures(features = []) {
  const valuesByKey = new Map();
  const fieldOrder = [];

  for (const feature of features) {
    const properties = feature?.properties;
    if (!properties || typeof properties !== "object") {
      continue;
    }

    Object.entries(properties).forEach(([key, value]) => {
      if (!valuesByKey.has(key)) {
        valuesByKey.set(key, []);
        fieldOrder.push(key);
      }
      valuesByKey.get(key).push(value);
    });
  }

  return fieldOrder.map((key) => ({
    key,
    label: humanizeFieldLabel(key),
    type: inferFieldType(valuesByKey.get(key) ?? []),
    required: false,
    visible: true,
    sortable: true,
    filterable: true,
  }));
}
