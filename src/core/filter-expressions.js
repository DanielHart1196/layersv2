const DATASET_FILTER_FIELD = "__dataset";
const DATASET_FILTER_PROPERTY = "_dataset_id";
const DATASET_FILTER_LABEL = "Dataset";
const DEFAULT_TIME_DELAY_FIELD = "_valid_from_ms";
const TIME_DELAY_FILTER_MODE = "time-delay";

function resolveFilterExpressionField(field) {
  return field === DATASET_FILTER_FIELD ? DATASET_FILTER_PROPERTY : field;
}

function buildExactMatchFilterExpression(field, value) {
  const expressionField = resolveFilterExpressionField(field);
  return [
    "==",
    ["to-string", ["coalesce", ["get", expressionField], ""]],
    value == null ? "" : String(value),
  ];
}

function buildStringComparisonFilterExpression(op, field, value) {
  const expressionField = resolveFilterExpressionField(field);
  const comparisonValue = value == null ? "" : String(value);
  if (op === "!=") {
    return [
      "!=",
      ["to-string", ["coalesce", ["get", expressionField], ""]],
      comparisonValue,
    ];
  }
  return buildExactMatchFilterExpression(field, comparisonValue);
}

function evaluateExpressionValue(expression, properties = {}) {
  if (!Array.isArray(expression)) {
    return expression;
  }

  const [op, ...args] = expression;
  if (op === "get") {
    const key = String(args[0] ?? "");
    return properties && typeof properties === "object" && Object.hasOwn(properties, key)
      ? properties[key]
      : undefined;
  }
  if (op === "literal") {
    return args[0];
  }
  if (op === "coalesce") {
    for (const arg of args) {
      const value = evaluateExpressionValue(arg, properties);
      if (value !== null && value !== undefined) {
        return value;
      }
    }
    return null;
  }
  if (op === "to-string") {
    const value = evaluateExpressionValue(args[0], properties);
    return value == null ? "" : String(value);
  }
  if (op === "to-number") {
    const value = evaluateExpressionValue(args[0], properties);
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  return evaluatePropertyExpression(expression, properties);
}

function evaluatePropertyExpression(expression, properties = {}) {
  if (!Array.isArray(expression)) {
    return Boolean(expression);
  }

  const [op, ...args] = expression;
  if (op === "all") {
    return args.every((arg) => evaluatePropertyExpression(arg, properties));
  }
  if (op === "any") {
    return args.some((arg) => evaluatePropertyExpression(arg, properties));
  }
  if (op === "none") {
    return args.every((arg) => !evaluatePropertyExpression(arg, properties));
  }
  if (op === "!") {
    return !evaluatePropertyExpression(args[0], properties);
  }
  if (op === "has") {
    return properties?.[args[0]] !== undefined;
  }
  if (op === "!has") {
    return properties?.[args[0]] === undefined;
  }
  if (["==", "!=", ">", ">=", "<", "<="].includes(op)) {
    const left = evaluateExpressionValue(args[0], properties);
    const right = evaluateExpressionValue(args[1], properties);
    if (op === "==") return left === right;
    if (op === "!=") return left !== right;
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) {
      return false;
    }
    if (op === ">") return leftNumber > rightNumber;
    if (op === ">=") return leftNumber >= rightNumber;
    if (op === "<") return leftNumber < rightNumber;
    if (op === "<=") return leftNumber <= rightNumber;
  }
  if (op === "in" || op === "!in") {
    const left = evaluateExpressionValue(args[0], properties);
    const matched = args.slice(1)
      .map((arg) => evaluateExpressionValue(arg, properties))
      .includes(left);
    return op === "in" ? matched : !matched;
  }

  return Boolean(evaluateExpressionValue(expression, properties));
}

function normalizeDelayHours(value, fallback = 24) {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours < 0) {
    return fallback;
  }
  return Math.min(8760, hours);
}

function getDelayedCutoffMs(delayHours, nowMs = Date.now()) {
  return nowMs - (normalizeDelayHours(delayHours) * 60 * 60 * 1000);
}

function isTimeDelayFilter(filter) {
  return filter?.mode === TIME_DELAY_FILTER_MODE || filter?.type === TIME_DELAY_FILTER_MODE;
}

function buildTimeDelayFilterExpression(filter, nowMs = Date.now()) {
  if (!isTimeDelayFilter(filter)) {
    return null;
  }
  const field = String(filter.timestampField ?? DEFAULT_TIME_DELAY_FIELD).trim() || DEFAULT_TIME_DELAY_FIELD;
  const cutoffMs = getDelayedCutoffMs(filter.delayHours, nowMs);
  const markerWindowMinutes = Number(filter.markerWindowMinutes ?? 5);
  const markerWindowMs = (Number.isFinite(markerWindowMinutes) && markerWindowMinutes > 0 ? markerWindowMinutes : 5) * 60 * 1000;
  const timestampValue = ["to-number", ["coalesce", ["get", field], Number.MAX_SAFE_INTEGER]];
  const visibleUpToCutoff = ["<=", timestampValue, cutoffMs];
  return [
    "any",
    [
      "all",
      ["!=", ["to-string", ["coalesce", ["get", "_replay_kind"], ""]], "track-point"],
      visibleUpToCutoff,
    ],
    [
      "all",
      ["==", ["to-string", ["coalesce", ["get", "_replay_kind"], ""]], "track-point"],
      visibleUpToCutoff,
      [">", timestampValue, cutoffMs - markerWindowMs],
    ],
  ];
}

export {
  DATASET_FILTER_FIELD,
  DATASET_FILTER_LABEL,
  DATASET_FILTER_PROPERTY,
  DEFAULT_TIME_DELAY_FIELD,
  TIME_DELAY_FILTER_MODE,
  buildExactMatchFilterExpression,
  buildStringComparisonFilterExpression,
  buildTimeDelayFilterExpression,
  evaluateExpressionValue,
  evaluatePropertyExpression,
  getDelayedCutoffMs,
  isTimeDelayFilter,
  normalizeDelayHours,
};
