const DATASET_FILTER_FIELD = "__dataset";
const DATASET_FILTER_PROPERTY = "_dataset_id";
const DATASET_FILTER_LABEL = "Dataset";

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

export {
  DATASET_FILTER_FIELD,
  DATASET_FILTER_LABEL,
  DATASET_FILTER_PROPERTY,
  buildExactMatchFilterExpression,
  buildStringComparisonFilterExpression,
  evaluateExpressionValue,
  evaluatePropertyExpression,
};
