var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/real-ai/matching/index.ts
var index_exports = {};
__export(index_exports, {
  CandidateRetriever: () => CandidateRetriever,
  DEFAULT_MATCH_POLICY: () => DEFAULT_MATCH_POLICY,
  MatchEngine: () => MatchEngine,
  MockSemanticMatchProvider: () => MockSemanticMatchProvider,
  ProductMatchResultSchema: () => ProductMatchResultSchema,
  applicationScore: () => applicationScore,
  assessInputQuality: () => assessInputQuality,
  characterBigrams: () => characterBigrams,
  compactName: () => compactName,
  compareSpecifications: () => compareSpecifications,
  detectConflicts: () => detectConflicts,
  deterministicScore: () => deterministicScore,
  matchApplication: () => matchApplication,
  matchModel: () => matchModel,
  matchName: () => matchName,
  matchSpecifications: () => matchSpecifications,
  nameScore: () => nameScore,
  normalizeModel: () => normalizeModel,
  normalizeProductName: () => normalizeProductName,
  normalizeSpecificationName: () => normalizeSpecificationName,
  normalizeUnicode: () => normalizeUnicode,
  resolveMatchPolicy: () => resolveMatchPolicy,
  scoreLevel: () => scoreLevel,
  setSimilarity: () => setSimilarity,
  textSimilarity: () => textSimilarity,
  uniqueStrings: () => uniqueStrings
});
module.exports = __toCommonJS(index_exports);

// src/real-ai/types/contracts.ts
var SCHEMA_VERSION = "1.0";

// src/real-ai/catalog/excel-importer.ts
var XLSX = __toESM(require("xlsx"), 1);

// src/real-ai/catalog/normalization.ts
var DASHES = /[‐‑‒–—―﹘﹣－]/g;
var MODEL_SEPARATORS = /[\s\-_.·•/\\]+/g;
var SPECIFICATION_NAMES = {
  width: "\u5DE5\u4F5C\u5BBD\u5EA6",
  workingwidth: "\u5DE5\u4F5C\u5BBD\u5EA6",
  \u5DE5\u4F5C\u5BBD\u5EA6: "\u5DE5\u4F5C\u5BBD\u5EA6",
  \u529F\u7387: "\u529F\u7387",
  power: "\u529F\u7387",
  \u4EA7\u80FD: "\u4EA7\u80FD",
  capacity: "\u4EA7\u80FD",
  \u5C3A\u5BF8: "\u5C3A\u5BF8",
  size: "\u5C3A\u5BF8",
  dimension: "\u5C3A\u5BF8",
  \u6750\u8D28: "\u6750\u8D28",
  material: "\u6750\u8D28",
  \u91CD\u91CF: "\u91CD\u91CF",
  weight: "\u91CD\u91CF"
};
var UNIT_RULES = {
  mm: { baseUnit: "mm", factor: 1, canonical: "mm" },
  cm: { baseUnit: "mm", factor: 10, canonical: "cm" },
  m: { baseUnit: "mm", factor: 1e3, canonical: "m" },
  g: { baseUnit: "g", factor: 1, canonical: "g" },
  kg: { baseUnit: "g", factor: 1e3, canonical: "kg" },
  w: { baseUnit: "W", factor: 1, canonical: "W" },
  kw: { baseUnit: "W", factor: 1e3, canonical: "kW" }
};
function normalizeUnicode(value) {
  return String(value ?? "").normalize("NFKC").replace(DASHES, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
}
function normalizeProductName(value) {
  return normalizeUnicode(value).toLocaleUpperCase("en-US").replace(/[，,。.;；:：、|｜()[\]{}【】<>《》"']/g, " ").replace(/\s+/g, " ").trim();
}
function normalizeModel(value) {
  return normalizeUnicode(value).toLocaleUpperCase("en-US").replace(MODEL_SEPARATORS, "").replace(/[^A-Z0-9\u3400-\u9FFF]/g, "");
}
function normalizeSpecificationName(value) {
  const raw = normalizeUnicode(value);
  const key = raw.toLocaleLowerCase("en-US").replace(/[\s._-]+/g, "");
  return SPECIFICATION_NAMES[key] ?? raw;
}
function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
}
function parseSpecification(rawName, rawValue) {
  const name = normalizeUnicode(rawName);
  const value = normalizeUnicode(rawValue);
  const match = value.match(/^(-?\d+(?:\.\d+)?)\s*(mm|cm|m|g|kg|w|kw)$/i);
  if (!match) {
    return {
      schemaVersion: SCHEMA_VERSION,
      rawName: name,
      normalizedName: normalizeSpecificationName(name),
      rawValue: value,
      normalizedValue: value,
      unit: null,
      baseValue: null,
      baseUnit: null,
      valueType: "text",
      parseStatus: "raw"
    };
  }
  const numericValue = Number(match[1]);
  const rule = UNIT_RULES[match[2].toLocaleLowerCase("en-US")];
  const baseValue = numericValue * rule.factor;
  return {
    schemaVersion: SCHEMA_VERSION,
    rawName: name,
    normalizedName: normalizeSpecificationName(name),
    rawValue: value,
    normalizedValue: `${formatNumber(baseValue)}${rule.baseUnit}`,
    unit: rule.canonical,
    baseValue,
    baseUnit: rule.baseUnit,
    valueType: "number",
    parseStatus: "normalized"
  };
}

// src/real-ai/catalog/schemas.ts
var import_zod = require("zod");
var schemaVersion = import_zod.z.literal("1.0");
var ProductSpecificationSchema = import_zod.z.object({
  schemaVersion,
  rawName: import_zod.z.string().min(1).max(200),
  normalizedName: import_zod.z.string().min(1).max(200),
  rawValue: import_zod.z.string().max(1e3),
  normalizedValue: import_zod.z.string().max(1e3),
  unit: import_zod.z.string().max(20).nullable(),
  baseValue: import_zod.z.number().finite().nullable(),
  baseUnit: import_zod.z.string().max(20).nullable(),
  valueType: import_zod.z.enum(["number", "text"]),
  parseStatus: import_zod.z.enum(["normalized", "raw"])
});
var ProductRecordSchema = import_zod.z.object({
  schemaVersion,
  productId: import_zod.z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/),
  productName: import_zod.z.string().min(1).max(200),
  model: import_zod.z.string().max(120),
  category: import_zod.z.string().max(120),
  specifications: import_zod.z.record(import_zod.z.string(), import_zod.z.string().max(1e3)),
  specificationDetails: import_zod.z.array(ProductSpecificationSchema).max(100),
  applications: import_zod.z.array(import_zod.z.string().max(300)).max(100),
  keywords: import_zod.z.array(import_zod.z.string().max(100)).max(100),
  synonyms: import_zod.z.array(import_zod.z.string().max(200)).max(100),
  description: import_zod.z.string().max(5e3),
  status: import_zod.z.enum(["active", "inactive"]),
  version: import_zod.z.number().int().positive(),
  createdAt: import_zod.z.string().datetime(),
  updatedAt: import_zod.z.string().datetime(),
  source: import_zod.z.object({
    schemaVersion,
    type: import_zod.z.enum(["excel", "manual", "system"]),
    importId: import_zod.z.string().min(1).max(100),
    fileName: import_zod.z.string().min(1).max(260),
    sheet: import_zod.z.string().min(1).max(200)
  }),
  sourceRow: import_zod.z.number().int().positive(),
  normalizedName: import_zod.z.string().min(1).max(200),
  normalizedModel: import_zod.z.string().max(120)
});
var CatalogSnapshotSchema = import_zod.z.object({
  schemaVersion,
  catalogVersion: import_zod.z.number().int().positive(),
  createdAt: import_zod.z.string().datetime(),
  source: import_zod.z.object({
    type: import_zod.z.enum(["import", "rollback"]),
    importId: import_zod.z.string().min(1).max(100),
    sourceFile: import_zod.z.string().min(1).max(260),
    restoredFromVersion: import_zod.z.number().int().positive().optional()
  }),
  checksum: import_zod.z.string().regex(/^[a-f0-9]{64}$/),
  products: import_zod.z.array(ProductRecordSchema)
});
var CatalogManifestSchema = import_zod.z.object({
  schemaVersion,
  currentVersion: import_zod.z.number().int().positive().nullable(),
  previousVersion: import_zod.z.number().int().positive().nullable(),
  updatedAt: import_zod.z.string().datetime().nullable()
});

// src/real-ai/catalog/excel-importer.ts
var FIELD_ALIASES = {
  productId: ["\u4EA7\u54C1id", "\u4EA7\u54C1\u7F16\u53F7", "\u5546\u54C1\u7F16\u53F7", "productid", "product_id", "sku"],
  productName: ["\u4EA7\u54C1\u540D\u79F0", "\u54C1\u540D", "\u5546\u54C1\u540D\u79F0", "\u4EA7\u54C1", "productname", "product_name", "name"],
  model: ["\u578B\u53F7", "\u89C4\u683C\u578B\u53F7", "\u4EA7\u54C1\u578B\u53F7", "model", "modelno", "modelnumber"],
  category: ["\u5206\u7C7B", "\u4EA7\u54C1\u5206\u7C7B", "\u7C7B\u522B", "category", "type"],
  applications: ["\u5E94\u7528\u573A\u666F", "\u5E94\u7528", "\u9002\u7528\u573A\u666F", "\u9002\u7528\u884C\u4E1A", "applications", "application"],
  keywords: ["\u5173\u952E\u8BCD", "\u6807\u7B7E", "\u5173\u952E\u5B57", "keywords", "keyword", "tags"],
  synonyms: ["\u540C\u4E49\u8BCD", "\u522B\u540D", "\u5176\u4ED6\u540D\u79F0", "synonyms", "synonym", "aliases"],
  description: ["\u4EA7\u54C1\u8BF4\u660E", "\u63CF\u8FF0", "\u4EA7\u54C1\u63CF\u8FF0", "\u4ECB\u7ECD", "description", "details"],
  status: ["\u72B6\u6001", "\u4EA7\u54C1\u72B6\u6001", "status", "enabled"]
};
var ALIAS_LOOKUP = /* @__PURE__ */ new Map();
for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
  for (const alias of aliases) ALIAS_LOOKUP.set(normalizeHeader(alias), field);
}
function normalizeHeader(value) {
  return normalizeUnicode(value).toLocaleLowerCase("en-US").replace(/[\s._-]+/g, "");
}

// src/real-ai/matching/normalizer.ts
function compactName(value) {
  return normalizeProductName(value).replace(/\s+/g, "");
}
function characterBigrams(value) {
  const normalized = compactName(value);
  if (!normalized) return /* @__PURE__ */ new Set();
  if (normalized.length === 1) return /* @__PURE__ */ new Set([normalized]);
  const result = /* @__PURE__ */ new Set();
  for (let index = 0; index < normalized.length - 1; index += 1) result.add(normalized.slice(index, index + 2));
  return result;
}
function setSimilarity(left, right) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}
function textSimilarity(left, right) {
  const a = compactName(left);
  const b = compactName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length) * 0.9;
  return setSimilarity(characterBigrams(a), characterBigrams(b));
}
function uniqueStrings(values) {
  return [...new Set(values.map((value) => normalizeUnicode(value)).filter(Boolean))];
}

// src/real-ai/matching/application-matcher.ts
function applicationScore(application, candidate) {
  if (!application) return 0;
  return Math.max(0, ...candidate.applications.map((entry) => textSimilarity(application, entry)), ...candidate.keywords.map((entry) => textSimilarity(application, entry)));
}
function matchApplication(product, candidate, catalogVersion) {
  if (!product.application) return { dimension: "application", available: false, score: 0, matchedRules: [], conflictingRules: [], evidence: [], hasHardConflict: false, hasMissingHardSpecification: false };
  const score = applicationScore(product.application, candidate);
  const best = [...candidate.applications, ...candidate.keywords].sort((left, right) => textSimilarity(product.application, right) - textSimilarity(product.application, left))[0] ?? "";
  const matchedRules = score >= 0.5 ? [{
    schemaVersion: SCHEMA_VERSION,
    code: "APPLICATION_SIMILAR",
    dimension: "application",
    description: `\u5E94\u7528\u573A\u666F\u4E0E\u4EA7\u54C1\u5E93\u201C${best}\u201D\u76F8\u5173`,
    customerValue: product.application,
    catalogValue: best,
    importance: "soft"
  }] : [];
  const evidence = [
    ...product.evidence.filter((entry) => entry.field === "application").map((entry) => ({
      schemaVersion: SCHEMA_VERSION,
      side: "customer",
      dimension: "application",
      field: "application",
      value: product.application ?? "",
      description: `\u5BA2\u6237\u8D44\u6599\u5E94\u7528\u573A\u666F\uFF1A${product.application}`,
      sourceFile: "sourceFile" in entry ? String(entry.sourceFile) : product.sourceFile,
      source: entry.source,
      catalogProductId: null,
      catalogVersion: null
    })),
    ...best ? [{
      schemaVersion: SCHEMA_VERSION,
      side: "catalog",
      dimension: "application",
      field: "applications",
      value: best,
      description: `\u4EA7\u54C1\u5E93\u5E94\u7528\u4F9D\u636E\uFF1A${best}`,
      sourceFile: candidate.source.fileName,
      source: null,
      catalogProductId: candidate.productId,
      catalogVersion
    }] : []
  ];
  return { dimension: "application", available: true, score, matchedRules, conflictingRules: [], evidence, hasHardConflict: false, hasMissingHardSpecification: false };
}

// src/real-ai/matching/name-matcher.ts
function nameScore(productName, candidate) {
  if (!productName) return { score: 0, reason: "" };
  const input = compactName(productName);
  const standard = compactName(candidate.productName);
  const category = compactName(candidate.category);
  if (input === standard) return { score: 1, reason: "\u6807\u51C6\u4EA7\u54C1\u540D\u79F0\u4E00\u81F4" };
  const synonym = candidate.synonyms.find((entry) => compactName(entry) === input);
  if (synonym) return { score: 0.96, reason: `\u547D\u4E2D\u4F01\u4E1A\u540C\u4E49\u8BCD\u201C${synonym}\u201D` };
  if (input === category) return { score: 0.9, reason: `\u540D\u79F0\u4E0E\u4EA7\u54C1\u5206\u7C7B\u201C${candidate.category}\u201D\u4E00\u81F4` };
  const keyword = candidate.keywords.find((entry) => compactName(entry) === input);
  if (keyword) return { score: 0.86, reason: `\u547D\u4E2D\u4EA7\u54C1\u5173\u952E\u8BCD\u201C${keyword}\u201D` };
  const values = [candidate.productName, candidate.category, ...candidate.synonyms, ...candidate.keywords];
  const score = Math.max(...values.map((entry) => textSimilarity(productName, entry)));
  return { score, reason: score >= 0.55 ? "\u4EA7\u54C1\u540D\u79F0\u4E0E\u4F01\u4E1A\u540D\u79F0\u3001\u540C\u4E49\u8BCD\u6216\u5173\u952E\u8BCD\u90E8\u5206\u91CD\u5408" : "" };
}
function matchName(product, candidate, catalogVersion) {
  if (!product.productName) return { dimension: "name", available: false, score: 0, matchedRules: [], conflictingRules: [], evidence: [], hasHardConflict: false, hasMissingHardSpecification: false };
  const assessment = nameScore(product.productName, candidate);
  const matchedRules = assessment.score >= 0.55 ? [{
    schemaVersion: SCHEMA_VERSION,
    code: assessment.score === 1 ? "NAME_EXACT" : "NAME_SIMILAR",
    dimension: "name",
    description: assessment.reason,
    customerValue: product.productName,
    catalogValue: candidate.productName,
    importance: "soft"
  }] : [];
  const evidence = [
    ...product.evidence.filter((entry) => entry.field === "productName").map((entry) => ({
      schemaVersion: SCHEMA_VERSION,
      side: "customer",
      dimension: "name",
      field: "productName",
      value: product.productName ?? "",
      description: `\u5BA2\u6237\u8D44\u6599\u4EA7\u54C1\u540D\u79F0\uFF1A${product.productName}`,
      sourceFile: "sourceFile" in entry ? String(entry.sourceFile) : product.sourceFile,
      source: entry.source,
      catalogProductId: null,
      catalogVersion: null
    })),
    {
      schemaVersion: SCHEMA_VERSION,
      side: "catalog",
      dimension: "name",
      field: "productName",
      value: candidate.productName,
      description: `\u4EA7\u54C1\u5E93\u540D\u79F0\uFF1A${candidate.productName}`,
      sourceFile: candidate.source.fileName,
      source: null,
      catalogProductId: candidate.productId,
      catalogVersion
    }
  ];
  return { dimension: "name", available: true, score: assessment.score, matchedRules, conflictingRules: [], evidence, hasHardConflict: false, hasMissingHardSpecification: false };
}

// src/real-ai/matching/candidate-retriever.ts
function retrievalAssessment(product, candidate) {
  let retrievalScore = 0;
  const retrievalReasons = [];
  if (product.model && normalizeModel(product.model) === candidate.normalizedModel) {
    retrievalScore += 1e3;
    retrievalReasons.push("\u6807\u51C6\u5316\u578B\u53F7\u7CBE\u786E\u547D\u4E2D");
  }
  const name = nameScore(product.productName, candidate);
  if (name.score > 0) {
    retrievalScore += name.score * 400;
    if (name.reason) retrievalReasons.push(name.reason);
  }
  const application = applicationScore(product.application, candidate);
  if (application > 0) {
    retrievalScore += application * 100;
    retrievalReasons.push("\u5E94\u7528\u573A\u666F\u76F8\u5173");
  }
  const matchedSpecifications = Object.keys(product.specifications).filter((key) => candidate.specifications[key] !== void 0).length;
  if (matchedSpecifications) {
    retrievalScore += matchedSpecifications * 25;
    retrievalReasons.push(`${matchedSpecifications}\u9879\u89C4\u683C\u5B57\u6BB5\u53EF\u6BD4\u8F83`);
  }
  return { retrievalScore, retrievalReasons };
}
var CandidateRetriever = class {
  constructor(repository) {
    this.repository = repository;
  }
  repository;
  async retrieve(product, policy, options = {}) {
    const started = performance.now();
    const issues = [];
    const records = /* @__PURE__ */ new Map();
    const exact = product.model ? await this.repository.findByNormalizedModel(product.model) : [];
    const activeExact = [];
    for (const record of exact) {
      const parsed = ProductRecordSchema.safeParse(record);
      if (!parsed.success) {
        issues.push({ code: "INVALID_CATALOG_RECORD", message: `\u4EA7\u54C1\u5E93\u8BB0\u5F55 ${record.productId ?? "unknown"} \u7ED3\u6784\u65E0\u6548\uFF0C\u5DF2\u8DF3\u8FC7`, productIds: [record.productId ?? "unknown"] });
        continue;
      }
      if (parsed.data.status !== "active") {
        issues.push({ code: "INACTIVE_PRODUCT_SKIPPED", message: `\u505C\u7528\u4EA7\u54C1 ${parsed.data.productId} \u4E0D\u53C2\u4E0E\u5339\u914D`, productIds: [parsed.data.productId] });
        continue;
      }
      activeExact.push(parsed.data);
      records.set(parsed.data.productId, parsed.data);
    }
    if (activeExact.length > 1) {
      issues.push({
        code: "DUPLICATE_NORMALIZED_MODEL",
        message: `\u6807\u51C6\u5316\u578B\u53F7 ${normalizeModel(product.model)} \u5BF9\u5E94\u591A\u4E2A\u542F\u7528\u4EA7\u54C1\uFF0C\u7981\u6B62\u9759\u9ED8\u9009\u62E9\u7B2C\u4E00\u6761`,
        productIds: activeExact.map((record) => record.productId)
      });
    }
    const searchLimit = Math.min(Math.max((options.topK ?? policy.topK) * 4, 10), 100);
    const searched = await this.repository.searchCandidates({
      productName: product.productName ?? void 0,
      model: product.model ?? void 0,
      category: options.category,
      keywords: [...options.keywords ?? [], ...product.application ? [product.application] : []],
      limit: searchLimit
    });
    for (const record of searched) {
      const parsed = ProductRecordSchema.safeParse(record);
      if (!parsed.success) {
        issues.push({ code: "INVALID_CATALOG_RECORD", message: `\u5019\u9009\u4EA7\u54C1 ${record.productId ?? "unknown"} \u7ED3\u6784\u65E0\u6548\uFF0C\u5DF2\u8DF3\u8FC7`, productIds: [record.productId ?? "unknown"] });
        continue;
      }
      if (parsed.data.status !== "active") {
        issues.push({ code: "INACTIVE_PRODUCT_SKIPPED", message: `\u505C\u7528\u4EA7\u54C1 ${parsed.data.productId} \u4E0D\u53C2\u4E0E\u5339\u914D`, productIds: [parsed.data.productId] });
        continue;
      }
      records.set(parsed.data.productId, parsed.data);
    }
    const topK = Math.min(Math.max(options.topK ?? policy.topK, 1), 20);
    const candidates = [...records.values()].map((candidate) => ({ product: candidate, ...retrievalAssessment(product, candidate) })).filter((candidate) => candidate.retrievalScore > 0).sort((left, right) => right.retrievalScore - left.retrievalScore || left.product.productId.localeCompare(right.product.productId)).slice(0, topK);
    return { candidates, issues, durationMs: Math.max(0, Math.round(performance.now() - started)) };
  }
};

// src/real-ai/matching/config.ts
var rules = [
  { name: "\u5DE5\u4F5C\u5BBD\u5EA6", importance: "hard", comparison: "candidate-minimum", toleranceRatio: 0 },
  { name: "\u6700\u5927\u5DE5\u4F5C\u5BBD\u5EA6", importance: "hard", comparison: "candidate-minimum", toleranceRatio: 0 },
  { name: "\u5C3A\u5BF8", importance: "hard", comparison: "equal", toleranceRatio: 0.01 },
  { name: "\u7535\u538B", importance: "hard", comparison: "equal", toleranceRatio: 0.01 },
  { name: "\u529F\u7387", importance: "hard", comparison: "equal", toleranceRatio: 0.02 },
  { name: "\u6700\u5927\u8D1F\u8F7D", importance: "hard", comparison: "candidate-minimum", toleranceRatio: 0 },
  { name: "\u4EA7\u80FD", importance: "hard", comparison: "candidate-minimum", toleranceRatio: 0 },
  { name: "\u63A5\u53E3\u89C4\u683C", importance: "hard", comparison: "equal", toleranceRatio: 0 },
  { name: "\u6750\u8D28", importance: "soft", comparison: "equal", toleranceRatio: 0 },
  { name: "\u5916\u89C2", importance: "soft", comparison: "equal", toleranceRatio: 0 },
  { name: "\u53EF\u9009\u9644\u4EF6", importance: "informational", comparison: "equal", toleranceRatio: 0 }
];
var DEFAULT_MATCH_POLICY = {
  weights: {
    model: 0.45,
    name: 0.25,
    specification: 0.2,
    application: 0.1
  },
  thresholds: {
    high: 0.82,
    medium: 0.6,
    low: 0.35,
    closeCandidateDelta: 0.05
  },
  specificationRules: Object.fromEntries(rules.map((rule) => [normalizeSpecificationName(rule.name), rule])),
  defaultSpecificationRule: {
    importance: "informational",
    comparison: "equal",
    toleranceRatio: 0
  },
  topK: 5,
  semanticTopK: 3,
  maxSemanticAdjustment: 0.05
};
function resolveMatchPolicy(override) {
  if (!override) return structuredClone(DEFAULT_MATCH_POLICY);
  return {
    ...DEFAULT_MATCH_POLICY,
    ...override,
    weights: { ...DEFAULT_MATCH_POLICY.weights, ...override.weights },
    thresholds: { ...DEFAULT_MATCH_POLICY.thresholds, ...override.thresholds },
    specificationRules: {
      ...DEFAULT_MATCH_POLICY.specificationRules,
      ...override.specificationRules
    },
    defaultSpecificationRule: {
      ...DEFAULT_MATCH_POLICY.defaultSpecificationRule,
      ...override.defaultSpecificationRule
    }
  };
}

// src/real-ai/matching/conflict-detector.ts
function detectConflicts(assessments, input) {
  const model = assessments.find((entry) => entry.dimension === "model");
  const specification = assessments.find((entry) => entry.dimension === "specification");
  const hasModelMismatch = Boolean(model?.conflictingRules.some((rule) => rule.code === "MODEL_MISMATCH"));
  const hasMissingHardSpecification = Boolean(specification?.hasMissingHardSpecification);
  const hasHardConflict = hasModelMismatch || Boolean(specification?.hasHardConflict);
  const reviewReasons = [...input.reviewReasons];
  if (hasModelMismatch) reviewReasons.push("\u5BA2\u6237\u578B\u53F7\u4E0E\u5019\u9009\u4EA7\u54C1\u578B\u53F7\u4E0D\u4E00\u81F4\u3002");
  if (specification?.hasHardConflict) reviewReasons.push("\u5019\u9009\u4EA7\u54C1\u5B58\u5728\u5173\u952E\u786C\u89C4\u683C\u51B2\u7A81\u3002");
  if (hasMissingHardSpecification) reviewReasons.push("\u4EA7\u54C1\u5E93\u7F3A\u5C11\u5BA2\u6237\u63D0\u51FA\u7684\u5173\u952E\u89C4\u683C\uFF0C\u5F53\u524D\u65E0\u6CD5\u5B8C\u6574\u9A8C\u8BC1\u3002");
  return { hasHardConflict, hasModelMismatch, hasMissingHardSpecification, reviewReasons: [...new Set(reviewReasons)] };
}

// src/real-ai/matching/input-quality.ts
var OCR_WARNING_CODES = /* @__PURE__ */ new Set(["OCR_MODEL_UNCERTAIN", "OCR_LOW_CONFIDENCE"]);
function assessInputQuality(product, warnings = []) {
  const reviewReasons = [...product.reviewReasons];
  const hasOcrModelAmbiguity = warnings.some((warning) => OCR_WARNING_CODES.has(warning.code) && (warning.field === "model" || warning.field === null));
  const hasProductConflict = product.conflicts.length > 0;
  const criticalFields = [
    product.productName ? "productName" : null,
    product.model ? "model" : null,
    ...Object.keys(product.specifications).map((name) => `specifications.${name}`)
  ].filter((value) => Boolean(value));
  const hasMissingEvidence = criticalFields.some((field) => !product.evidence.some((entry) => entry.field === field));
  if (hasOcrModelAmbiguity) reviewReasons.push(`OCR\u578B\u53F7\u5B58\u5728\u5B57\u7B26\u6B67\u4E49\uFF1A\u5BA2\u6237\u539F\u59CB\u8BC6\u522B\u4E3A${product.model ?? "\u7A7A\u503C"}\uFF0C\u9700\u8981\u4EBA\u5DE5\u786E\u8BA4\u3002`);
  if (hasProductConflict) reviewReasons.push("\u5BA2\u6237\u8D44\u6599\u5305\u542B\u591A\u6765\u6E90\u5B57\u6BB5\u51B2\u7A81\uFF0C\u9700\u8981\u4EBA\u5DE5\u786E\u8BA4\u3002");
  if (hasMissingEvidence) reviewReasons.push("\u90E8\u5206\u5173\u952E\u63D0\u53D6\u5B57\u6BB5\u7F3A\u5C11\u53EF\u8FFD\u6EAFEvidence\uFF0C\u9700\u8981\u4EBA\u5DE5\u786E\u8BA4\u3002");
  if (product.needsHumanReview) reviewReasons.push("\u4E0A\u6E38\u7ED3\u6784\u5316\u63D0\u53D6\u5DF2\u6807\u8BB0\u9700\u8981\u4EBA\u5DE5\u786E\u8BA4\u3002");
  const evidence = warnings.map((warning) => ({
    schemaVersion: SCHEMA_VERSION,
    side: "rule",
    dimension: "input",
    field: warning.field ?? "",
    value: warning.code,
    description: warning.message,
    sourceFile: warning.sourceFile,
    source: warning.sourceLocations[0] ?? null,
    catalogProductId: null,
    catalogVersion: null
  }));
  return {
    usable: Boolean(product.productName || product.model || Object.keys(product.specifications).length || product.application),
    hasOcrModelAmbiguity,
    hasProductConflict,
    hasMissingEvidence,
    reviewReasons: [...new Set(reviewReasons)],
    evidence
  };
}

// src/real-ai/matching/model-matcher.ts
function customerEvidence(product, model) {
  return product.evidence.filter((entry) => entry.field === "model").map((entry) => ({
    schemaVersion: SCHEMA_VERSION,
    side: "customer",
    dimension: "model",
    field: "model",
    value: model,
    description: `\u5BA2\u6237\u8D44\u6599\u578B\u53F7\uFF1A${model}`,
    sourceFile: "sourceFile" in entry ? String(entry.sourceFile) : product.sourceFile,
    source: entry.source,
    catalogProductId: null,
    catalogVersion: null
  }));
}
function matchModel(product, candidate, catalogVersion) {
  const customerModel = normalizeModel(product.model);
  const catalogModel = candidate.normalizedModel || normalizeModel(candidate.model);
  if (!customerModel) return { dimension: "model", available: false, score: 0, matchedRules: [], conflictingRules: [], evidence: [], hasHardConflict: false, hasMissingHardSpecification: false };
  const evidence = [
    ...customerEvidence(product, product.model ?? ""),
    {
      schemaVersion: SCHEMA_VERSION,
      side: "catalog",
      dimension: "model",
      field: "model",
      value: candidate.model,
      description: `\u4EA7\u54C1\u5E93\u578B\u53F7\uFF1A${candidate.model}`,
      sourceFile: candidate.source.fileName,
      source: null,
      catalogProductId: candidate.productId,
      catalogVersion
    }
  ];
  const exact = customerModel === catalogModel;
  const rule = {
    schemaVersion: SCHEMA_VERSION,
    code: exact ? "MODEL_EXACT" : "MODEL_MISMATCH",
    dimension: "model",
    description: exact ? `\u578B\u53F7 ${product.model} \u6807\u51C6\u5316\u540E\u7CBE\u786E\u4E00\u81F4` : `\u5BA2\u6237\u578B\u53F7 ${product.model} \u4E0E\u5019\u9009\u578B\u53F7 ${candidate.model} \u4E0D\u4E00\u81F4`,
    customerValue: product.model,
    catalogValue: candidate.model,
    importance: "hard"
  };
  return {
    dimension: "model",
    available: true,
    score: exact ? 1 : 0,
    matchedRules: exact ? [rule] : [],
    conflictingRules: exact ? [] : [rule],
    evidence,
    hasHardConflict: !exact,
    hasMissingHardSpecification: false
  };
}

// src/real-ai/matching/scorer.ts
function deterministicScore(assessments, policy) {
  const available = assessments.filter((entry) => entry.available);
  const totalWeight = available.reduce((sum, entry) => sum + policy.weights[entry.dimension], 0);
  if (!totalWeight) return 0;
  const score = available.reduce((sum, entry) => sum + entry.score * policy.weights[entry.dimension], 0) / totalWeight;
  return Number(Math.max(0, Math.min(1, score)).toFixed(4));
}
function scoreLevel(score, policy) {
  if (score >= policy.thresholds.high) return "high";
  if (score >= policy.thresholds.medium) return "medium";
  if (score >= policy.thresholds.low) return "low";
  return "none";
}

// src/real-ai/matching/schemas.ts
var import_zod2 = require("zod");
var schemaVersion2 = import_zod2.z.literal("1.0");
var extractionWarningCode = import_zod2.z.enum([
  "MISSING_CRITICAL_FIELD",
  "MISSING_FIELD_EVIDENCE",
  "UNKNOWN_EVIDENCE_REFERENCE",
  "EVIDENCE_REFERENCE_REPAIRED",
  "EVIDENCE_TEXT_MISMATCH",
  "MODEL_RESTORED_FROM_EVIDENCE",
  "OCR_LOW_CONFIDENCE",
  "OCR_MODEL_UNCERTAIN",
  "FIELD_CONFLICT",
  "UNCERTAIN_MERGE",
  "REPAIRED_MODEL_OUTPUT",
  "APPLICATION_RECLASSIFIED",
  "UNRESOLVED_PRODUCT_CANDIDATE",
  "EMPTY_PRODUCT_DROPPED",
  "CHUNK_LIMIT_REACHED"
]);
var extractionField = import_zod2.z.union([
  import_zod2.z.enum(["productName", "model", "quantity", "material", "process", "application", "notes"]),
  import_zod2.z.custom((value) => typeof value === "string" && value.startsWith("specifications.") && value.length > "specifications.".length)
]);
var sourceLocation = import_zod2.z.discriminatedUnion("kind", [
  import_zod2.z.object({ schemaVersion: schemaVersion2, kind: import_zod2.z.literal("pdf"), page: import_zod2.z.number().int().positive(), bbox: import_zod2.z.tuple([import_zod2.z.number(), import_zod2.z.number(), import_zod2.z.number(), import_zod2.z.number()]).optional() }),
  import_zod2.z.object({ schemaVersion: schemaVersion2, kind: import_zod2.z.literal("docx"), paragraph: import_zod2.z.number().int().positive().optional(), table: import_zod2.z.number().int().positive().optional(), row: import_zod2.z.number().int().positive().optional(), cell: import_zod2.z.number().int().positive().optional(), image: import_zod2.z.number().int().positive().optional() }),
  import_zod2.z.object({ schemaVersion: schemaVersion2, kind: import_zod2.z.literal("sheet"), sheet: import_zod2.z.string(), cell: import_zod2.z.string().optional(), range: import_zod2.z.string().optional(), row: import_zod2.z.number().int().positive().optional(), column: import_zod2.z.number().int().positive().optional() }),
  import_zod2.z.object({ schemaVersion: schemaVersion2, kind: import_zod2.z.literal("image"), imageId: import_zod2.z.string(), bbox: import_zod2.z.tuple([import_zod2.z.number(), import_zod2.z.number(), import_zod2.z.number(), import_zod2.z.number()]).optional() })
]);
var matchRule = import_zod2.z.object({
  schemaVersion: schemaVersion2,
  code: import_zod2.z.string().min(1),
  dimension: import_zod2.z.enum(["input", "model", "name", "specification", "application", "semantic"]),
  description: import_zod2.z.string().min(1),
  customerValue: import_zod2.z.string().nullable(),
  catalogValue: import_zod2.z.string().nullable(),
  importance: import_zod2.z.enum(["hard", "soft", "informational"]).nullable()
});
var matchEvidence = import_zod2.z.object({
  schemaVersion: schemaVersion2,
  side: import_zod2.z.enum(["customer", "catalog", "rule"]),
  dimension: import_zod2.z.enum(["input", "model", "name", "specification", "application", "semantic"]),
  field: import_zod2.z.string(),
  value: import_zod2.z.string(),
  description: import_zod2.z.string(),
  sourceFile: import_zod2.z.string().nullable(),
  source: sourceLocation.nullable(),
  catalogProductId: import_zod2.z.string().nullable(),
  catalogVersion: import_zod2.z.number().int().positive().nullable()
});
var extractedSnapshot = import_zod2.z.object({
  schemaVersion: schemaVersion2,
  id: import_zod2.z.string().min(1),
  productName: import_zod2.z.string().nullable(),
  model: import_zod2.z.string().nullable(),
  specifications: import_zod2.z.record(import_zod2.z.string(), import_zod2.z.string()),
  material: import_zod2.z.string().nullable(),
  process: import_zod2.z.string().nullable(),
  application: import_zod2.z.string().nullable(),
  sourceFile: import_zod2.z.string(),
  needsHumanReview: import_zod2.z.boolean(),
  warnings: import_zod2.z.array(import_zod2.z.object({
    schemaVersion: schemaVersion2,
    code: extractionWarningCode,
    message: import_zod2.z.string(),
    field: extractionField.nullable(),
    productId: import_zod2.z.string().nullable(),
    sourceFile: import_zod2.z.string().nullable(),
    sourceLocations: import_zod2.z.array(sourceLocation)
  })),
  conflicts: import_zod2.z.array(import_zod2.z.object({
    field: import_zod2.z.string(),
    message: import_zod2.z.string(),
    values: import_zod2.z.array(import_zod2.z.string())
  }))
});
var candidateSnapshot = import_zod2.z.object({
  schemaVersion: schemaVersion2,
  productId: import_zod2.z.string(),
  productName: import_zod2.z.string(),
  model: import_zod2.z.string(),
  category: import_zod2.z.string(),
  specifications: import_zod2.z.record(import_zod2.z.string(), import_zod2.z.string()),
  applications: import_zod2.z.array(import_zod2.z.string()),
  keywords: import_zod2.z.array(import_zod2.z.string()),
  synonyms: import_zod2.z.array(import_zod2.z.string()),
  status: import_zod2.z.enum(["active", "inactive"]),
  version: import_zod2.z.number().int().positive()
});
var ProductMatchResultSchema = import_zod2.z.object({
  schemaVersion: schemaVersion2,
  matchId: import_zod2.z.string().min(1),
  extractedProductId: import_zod2.z.string().min(1),
  extractedProductSnapshot: extractedSnapshot,
  candidateProductId: import_zod2.z.string().nullable(),
  candidateProductSnapshot: candidateSnapshot.nullable(),
  candidateRank: import_zod2.z.number().int().positive().nullable(),
  status: import_zod2.z.enum(["matched", "candidate", "unresolved", "none"]),
  level: import_zod2.z.enum(["exact", "high", "medium", "low", "none"]),
  score: import_zod2.z.number().min(0).max(1).nullable(),
  matchedRules: import_zod2.z.array(matchRule),
  conflictingRules: import_zod2.z.array(matchRule),
  evidence: import_zod2.z.array(matchEvidence),
  needsHumanReview: import_zod2.z.boolean(),
  reviewStatus: import_zod2.z.enum(["not_required", "pending"]),
  reviewReasons: import_zod2.z.array(import_zod2.z.string()),
  catalogVersion: import_zod2.z.number().int().positive().nullable(),
  createdAt: import_zod2.z.string().datetime()
}).superRefine((value, context) => {
  if (value.level === "none" && value.candidateProductId !== null) {
    context.addIssue({ code: "custom", message: "none\u7ED3\u679C\u4E0D\u80FD\u643A\u5E26\u5019\u9009\u4EA7\u54C1", path: ["candidateProductId"] });
  }
  if (value.candidateProductId === null && value.candidateProductSnapshot !== null) {
    context.addIssue({ code: "custom", message: "\u7A7A\u5019\u9009ID\u4E0D\u80FD\u643A\u5E26\u4EA7\u54C1\u5FEB\u7167", path: ["candidateProductSnapshot"] });
  }
});

// src/real-ai/matching/spec-matcher.ts
function stripApproximation(value) {
  return normalizeUnicode(value).replace(/^(?:约|大约|大概|approximately|approx\.?)[\s:]*/i, "");
}
function fallbackComparable(value) {
  const normalized = stripApproximation(value).replace(/\s+/g, "");
  const range = normalized.match(/^(-?\d+(?:\.\d+)?)(?:-|~|～|至)(-?\d+(?:\.\d+)?)(.*)$/);
  const single = normalized.match(/^(-?\d+(?:\.\d+)?)(.*)$/);
  if (range) {
    const left = parseSpecification("value", `${range[1]}${range[3]}`);
    const right = parseSpecification("value", `${range[2]}${range[3]}`);
    if (left.baseValue !== null && right.baseValue !== null && left.baseUnit === right.baseUnit) {
      return { raw: value, normalized, min: Math.min(left.baseValue, right.baseValue), max: Math.max(left.baseValue, right.baseValue), baseUnit: left.baseUnit };
    }
    return { raw: value, normalized, min: Number(range[1]), max: Number(range[2]), baseUnit: normalizeUnicode(range[3]).toLowerCase() || null };
  }
  if (single) {
    const parsed = parseSpecification("value", normalized);
    if (parsed.baseValue !== null) return { raw: value, normalized: parsed.normalizedValue, min: parsed.baseValue, max: parsed.baseValue, baseUnit: parsed.baseUnit };
    return { raw: value, normalized, min: Number(single[1]), max: Number(single[1]), baseUnit: normalizeUnicode(single[2]).toLowerCase() || null };
  }
  return { raw: value, normalized: normalized.toLocaleUpperCase("en-US"), min: null, max: null, baseUnit: null };
}
function detailValue(candidate, name) {
  return candidate.specificationDetails.find((entry) => entry.normalizedName === name);
}
function comparableCatalogValue(candidate, name, value) {
  const detail = detailValue(candidate, name);
  if (detail?.baseValue !== null && detail?.baseValue !== void 0) {
    return { raw: value, normalized: detail.normalizedValue, min: detail.baseValue, max: detail.baseValue, baseUnit: detail.baseUnit };
  }
  return fallbackComparable(value);
}
function sameUnit(left, right) {
  return left.baseUnit === right.baseUnit || !left.baseUnit && !right.baseUnit;
}
function numericMatch(customer, catalog, rule) {
  if (customer.min === null || customer.max === null || catalog.min === null || catalog.max === null || !sameUnit(customer, catalog)) return null;
  const tolerance = Math.max(Math.abs(customer.max), Math.abs(catalog.max), 1) * rule.toleranceRatio;
  if (rule.comparison === "candidate-minimum") return catalog.max + tolerance >= customer.max;
  if (rule.comparison === "candidate-maximum") return catalog.min - tolerance <= customer.min;
  const customerIsRange = customer.min !== customer.max;
  const catalogIsRange = catalog.min !== catalog.max;
  if (customerIsRange && !catalogIsRange) return catalog.min >= customer.min - tolerance && catalog.max <= customer.max + tolerance;
  if (!customerIsRange && catalogIsRange) return customer.min >= catalog.min - tolerance && customer.max <= catalog.max + tolerance;
  if (customerIsRange && catalogIsRange) return customer.max >= catalog.min - tolerance && catalog.max >= customer.min - tolerance;
  return Math.abs(customer.min - catalog.min) <= tolerance;
}
function customerSpecifications(product) {
  const specifications = {};
  for (const [name, value] of Object.entries(product.specifications)) specifications[normalizeSpecificationName(name)] = value;
  if (product.material && !specifications["\u6750\u8D28"]) specifications["\u6750\u8D28"] = product.material;
  return specifications;
}
function compareSpecifications(product, candidate, policy) {
  const results = [];
  for (const [rawName, customerValue] of Object.entries(customerSpecifications(product))) {
    const name = normalizeSpecificationName(rawName);
    const rule = policy.specificationRules[name] ?? { name, ...policy.defaultSpecificationRule };
    const catalogValue = candidate.specifications[name] ?? null;
    if (catalogValue === null) {
      results.push({ name, status: "missing", customerValue, catalogValue, rule });
      continue;
    }
    const customer = fallbackComparable(customerValue);
    const catalog = comparableCatalogValue(candidate, name, catalogValue);
    const numeric = numericMatch(customer, catalog, rule);
    if (numeric !== null) {
      results.push({ name, status: numeric ? "matched" : "conflicting", customerValue, catalogValue, rule });
      continue;
    }
    const exact = customer.normalized === catalog.normalized || normalizeUnicode(customerValue).toLocaleUpperCase("en-US") === normalizeUnicode(catalogValue).toLocaleUpperCase("en-US");
    results.push({ name, status: exact ? "matched" : "not-comparable", customerValue, catalogValue, rule });
  }
  return results;
}
function sourceEvidence(product, field, value) {
  const fields = field === "\u6750\u8D28" ? ["material", "specifications.\u6750\u8D28"] : [`specifications.${field}`];
  return product.evidence.filter((entry) => fields.includes(entry.field)).map((entry) => ({
    schemaVersion: SCHEMA_VERSION,
    side: "customer",
    dimension: "specification",
    field: fields[0],
    value,
    description: `\u5BA2\u6237\u8D44\u6599\u89C4\u683C ${field}\uFF1A${value}`,
    sourceFile: "sourceFile" in entry ? String(entry.sourceFile) : product.sourceFile,
    source: entry.source,
    catalogProductId: null,
    catalogVersion: null
  }));
}
function matchSpecifications(product, candidate, policy, catalogVersion) {
  const comparisons = compareSpecifications(product, candidate, policy);
  if (!comparisons.length) return { dimension: "specification", available: false, score: 0, matchedRules: [], conflictingRules: [], evidence: [], hasHardConflict: false, hasMissingHardSpecification: false };
  const matchedRules = [];
  const conflictingRules = [];
  const evidence = [];
  let scored = 0;
  let score = 0;
  let hasHardConflict = false;
  let hasMissingHardSpecification = false;
  for (const comparison of comparisons) {
    const { name, customerValue, catalogValue, rule, status } = comparison;
    const code = status === "matched" ? "SPEC_MATCHED" : status === "missing" ? "SPEC_MISSING" : status === "conflicting" ? "SPEC_CONFLICT" : "SPEC_NOT_COMPARABLE";
    const description = status === "matched" ? `${name}\u5339\u914D\uFF1A\u5BA2\u6237 ${customerValue}\uFF0C\u4EA7\u54C1\u5E93 ${catalogValue}` : status === "missing" ? `${name}\u65E0\u6CD5\u9A8C\u8BC1\uFF1A\u4EA7\u54C1\u5E93\u672A\u63D0\u4F9B\u8BE5\u89C4\u683C` : status === "conflicting" ? `${name}\u5B58\u5728${rule.importance === "hard" ? "\u786C" : "\u8F6F"}\u51B2\u7A81\uFF1A\u5BA2\u6237 ${customerValue}\uFF0C\u4EA7\u54C1\u5E93 ${catalogValue}` : `${name}\u683C\u5F0F\u4E0D\u53EF\u5B89\u5168\u6BD4\u8F83\uFF1A\u5BA2\u6237 ${customerValue}\uFF0C\u4EA7\u54C1\u5E93 ${catalogValue}`;
    const matchRule2 = { schemaVersion: SCHEMA_VERSION, code, dimension: "specification", description, customerValue, catalogValue, importance: rule.importance };
    if (status === "matched") matchedRules.push(matchRule2);
    else conflictingRules.push(matchRule2);
    scored += 1;
    if (status === "matched") score += 1;
    else if (status === "not-comparable" && rule.importance === "informational") score += 0.5;
    if (rule.importance === "hard" && status === "conflicting") hasHardConflict = true;
    if (rule.importance === "hard" && (status === "missing" || status === "not-comparable")) hasMissingHardSpecification = true;
    evidence.push(...sourceEvidence(product, name, customerValue));
    if (catalogValue !== null) evidence.push({
      schemaVersion: SCHEMA_VERSION,
      side: "catalog",
      dimension: "specification",
      field: `specifications.${name}`,
      value: catalogValue,
      description: `\u4EA7\u54C1\u5E93\u89C4\u683C ${name}\uFF1A${catalogValue}`,
      sourceFile: candidate.source.fileName,
      source: null,
      catalogProductId: candidate.productId,
      catalogVersion
    });
  }
  return { dimension: "specification", available: true, score: scored ? score / scored : 0, matchedRules, conflictingRules, evidence, hasHardConflict, hasMissingHardSpecification };
}

// src/real-ai/matching/match-engine.ts
function extractedSnapshot2(product, warnings = []) {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: product.id,
    productName: product.productName,
    model: product.model,
    specifications: structuredClone(product.specifications),
    material: product.material,
    process: product.process,
    application: product.application,
    sourceFile: product.sourceFile,
    needsHumanReview: product.needsHumanReview,
    warnings: structuredClone(warnings),
    conflicts: product.conflicts.map((conflict) => ({
      field: conflict.field,
      message: conflict.message,
      values: conflict.values.map((entry) => entry.value)
    }))
  };
}
function inputConflictRules(product) {
  return product.conflicts.map((conflict) => ({
    schemaVersion: SCHEMA_VERSION,
    code: "INPUT_FIELD_CONFLICT",
    dimension: conflict.field === "model" ? "model" : conflict.field.startsWith("specifications.") ? "specification" : "input",
    description: conflict.message,
    customerValue: conflict.values.map((entry) => entry.value).join(" / "),
    catalogValue: null,
    importance: conflict.field === "model" || conflict.field.startsWith("specifications.") ? "hard" : "soft"
  }));
}
function candidateSnapshot2(product) {
  return {
    schemaVersion: SCHEMA_VERSION,
    productId: product.productId,
    productName: product.productName,
    model: product.model,
    category: product.category,
    specifications: structuredClone(product.specifications),
    applications: [...product.applications],
    keywords: [...product.keywords],
    synonyms: [...product.synonyms],
    status: product.status,
    version: product.version
  };
}
function stableMatchId(extractedProductId, candidateProductId, catalogVersion) {
  const input = `${extractedProductId}|${candidateProductId ?? "none"}|${catalogVersion ?? "none"}`;
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `match_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
function ruleEvidence(rule, catalogProductId, catalogVersion) {
  return {
    schemaVersion: SCHEMA_VERSION,
    side: "rule",
    dimension: rule.dimension,
    field: rule.dimension,
    value: rule.code,
    description: rule.description,
    sourceFile: null,
    source: null,
    catalogProductId,
    catalogVersion
  };
}
function hasExactModel(assessments) {
  return assessments.some((assessment) => assessment.matchedRules.some((rule) => rule.code === "MODEL_EXACT"));
}
function determineLevel(score, assessments, input, policy) {
  const conflicts = detectConflicts(assessments, input);
  const hasIdentityOrSpecification = assessments.some((assessment) => assessment.available && ["model", "name", "specification"].includes(assessment.dimension));
  if (!hasIdentityOrSpecification) return score >= policy.thresholds.low ? "low" : "none";
  const exactEligible = hasExactModel(assessments) && !conflicts.hasHardConflict && !conflicts.hasMissingHardSpecification && !input.hasOcrModelAmbiguity && !input.hasProductConflict && !input.hasMissingEvidence && !input.reviewReasons.length;
  if (exactEligible) return "exact";
  let level = scoreLevel(score, policy);
  if (conflicts.hasHardConflict && level === "high") level = "medium";
  if (conflicts.hasModelMismatch && !input.hasOcrModelAmbiguity && (level === "high" || level === "medium")) level = "low";
  if (input.hasOcrModelAmbiguity && conflicts.hasModelMismatch && level === "high") level = "medium";
  return level;
}
function noneResult(product, warnings, catalogVersion, createdAt, unresolved, reasons) {
  const rule = {
    schemaVersion: SCHEMA_VERSION,
    code: unresolved ? "INPUT_UNRESOLVED" : "NO_REASONABLE_CANDIDATE",
    dimension: "input",
    description: unresolved ? "\u5BA2\u6237\u4EA7\u54C1\u4FE1\u606F\u4E0D\u8DB3\uFF0C\u5F53\u524D\u65E0\u6CD5\u5F62\u6210\u53EF\u9760\u5019\u9009" : "\u4F01\u4E1A\u4EA7\u54C1\u5E93\u4E2D\u672A\u627E\u5230\u8FBE\u5230\u6700\u4F4E\u9608\u503C\u7684\u5408\u7406\u5019\u9009",
    customerValue: product.productName ?? product.model,
    catalogValue: null,
    importance: null
  };
  return ProductMatchResultSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    matchId: stableMatchId(product.id, null, catalogVersion),
    extractedProductId: product.id,
    extractedProductSnapshot: extractedSnapshot2(product, warnings),
    candidateProductId: null,
    candidateProductSnapshot: null,
    candidateRank: null,
    status: unresolved ? "unresolved" : "none",
    level: "none",
    score: null,
    matchedRules: [],
    conflictingRules: [rule],
    evidence: [ruleEvidence(rule, null, catalogVersion)],
    needsHumanReview: true,
    reviewStatus: "pending",
    reviewReasons: [...new Set(reasons.length ? reasons : [rule.description])],
    catalogVersion,
    createdAt
  });
}
var MatchEngine = class {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.retriever = new CandidateRetriever(dependencies.repository);
  }
  dependencies;
  retriever;
  async match(request) {
    const started = performance.now();
    const policy = resolveMatchPolicy(request.options?.policy);
    const input = assessInputQuality(request.extractedProduct, request.extractionWarnings);
    const versionInfo = await this.dependencies.repository.getVersionInfo();
    const catalogVersion = versionInfo.currentVersion;
    const createdAt = (this.dependencies.now?.() ?? /* @__PURE__ */ new Date()).toISOString();
    const retrieval = await this.retriever.retrieve(request.extractedProduct, policy, {
      category: request.options?.category,
      keywords: request.options?.keywords,
      topK: request.options?.topK
    });
    if (request.catalogVersion !== void 0 && request.catalogVersion !== catalogVersion) {
      retrieval.issues.push({
        code: "CATALOG_VERSION_MISMATCH",
        message: `\u8BF7\u6C42\u4EA7\u54C1\u5E93\u7248\u672C ${request.catalogVersion} \u4E0E\u5F53\u524D\u7248\u672C ${catalogVersion ?? "\u7A7A"} \u4E0D\u4E00\u81F4`,
        productIds: []
      });
      input.reviewReasons.push("\u5339\u914D\u8BF7\u6C42\u6307\u5B9A\u7684\u4EA7\u54C1\u5E93\u7248\u672C\u4E0E\u5F53\u524D\u7248\u672C\u4E0D\u4E00\u81F4\u3002");
    }
    if (!input.usable || !catalogVersion) {
      return {
        schemaVersion: SCHEMA_VERSION,
        results: [noneResult(request.extractedProduct, request.extractionWarnings, catalogVersion, createdAt, true, input.reviewReasons)],
        retrievalIssues: retrieval.issues,
        metrics: { catalogVersion, candidateRetrievalMs: retrieval.durationMs, deterministicMatchingMs: 0, semanticReviewMs: 0, totalDurationMs: Math.round(performance.now() - started), candidateCount: 0 }
      };
    }
    const deterministicStarted = performance.now();
    const evaluated = retrieval.candidates.map((retrieved) => {
      const assessments = [
        matchModel(request.extractedProduct, retrieved.product, catalogVersion),
        matchName(request.extractedProduct, retrieved.product, catalogVersion),
        matchSpecifications(request.extractedProduct, retrieved.product, policy, catalogVersion),
        matchApplication(request.extractedProduct, retrieved.product, catalogVersion)
      ];
      return { retrieved, assessments, score: deterministicScore(assessments, policy), semantic: null };
    });
    const deterministicMatchingMs = Math.max(0, Math.round(performance.now() - deterministicStarted));
    evaluated.sort((left, right) => right.score - left.score || right.retrieved.retrievalScore - left.retrieved.retrievalScore || left.retrieved.product.productId.localeCompare(right.retrieved.product.productId));
    let semanticReviewMs = 0;
    if (request.options?.useSemanticReview && this.dependencies.semanticProvider && evaluated.length) {
      const response = await this.dependencies.semanticProvider.review({
        extractedProduct: extractedSnapshot2(request.extractedProduct, request.extractionWarnings),
        candidates: evaluated.slice(0, policy.semanticTopK).map((entry) => ({
          product: candidateSnapshot2(entry.retrieved.product),
          deterministicScore: entry.score,
          matchedRules: entry.assessments.flatMap((assessment) => assessment.matchedRules),
          conflictingRules: entry.assessments.flatMap((assessment) => assessment.conflictingRules)
        }))
      });
      semanticReviewMs = response.durationMs;
      for (const entry of evaluated) {
        const semantic = response.assessments.find((assessment) => assessment.candidateProductId === entry.retrieved.product.productId) ?? null;
        if (!semantic) continue;
        entry.semantic = semantic;
        const adjustment = Math.max(-policy.maxSemanticAdjustment, Math.min(policy.maxSemanticAdjustment, semantic.adjustment));
        entry.score = Number(Math.max(0, Math.min(1, entry.score + adjustment)).toFixed(4));
      }
      evaluated.sort((left, right) => right.score - left.score || right.retrieved.retrievalScore - left.retrieved.retrievalScore || left.retrieved.product.productId.localeCompare(right.retrieved.product.productId));
    }
    const duplicateModel = retrieval.issues.some((issue) => issue.code === "DUPLICATE_NORMALIZED_MODEL");
    const versionMismatch = retrieval.issues.some((issue) => issue.code === "CATALOG_VERSION_MISMATCH");
    const usableCandidates = evaluated.map((entry) => ({ entry, level: determineLevel(entry.score, entry.assessments, input, policy) })).filter(({ level }) => level !== "none");
    if (!usableCandidates.length) {
      return {
        schemaVersion: SCHEMA_VERSION,
        results: [noneResult(request.extractedProduct, request.extractionWarnings, catalogVersion, createdAt, false, input.reviewReasons)],
        retrievalIssues: retrieval.issues,
        metrics: { catalogVersion, candidateRetrievalMs: retrieval.durationMs, deterministicMatchingMs, semanticReviewMs, totalDurationMs: Math.round(performance.now() - started), candidateCount: evaluated.length }
      };
    }
    const topScore = usableCandidates[0].entry.score;
    const closeCandidates = usableCandidates.filter(({ entry }) => topScore - entry.score <= policy.thresholds.closeCandidateDelta);
    const results = usableCandidates.map(({ entry, level }, index) => {
      const product = entry.retrieved.product;
      const conflicts = detectConflicts(entry.assessments, input);
      const matchedRules = entry.assessments.flatMap((assessment) => assessment.matchedRules);
      const conflictingRules = [...inputConflictRules(request.extractedProduct), ...entry.assessments.flatMap((assessment) => assessment.conflictingRules)];
      const evidence = [...input.evidence, ...entry.assessments.flatMap((assessment) => assessment.evidence)];
      if (entry.semantic) {
        const semanticRule = {
          schemaVersion: SCHEMA_VERSION,
          code: entry.semantic.conflictsWithRules ? "SEMANTIC_RULE_CONFLICT" : "SEMANTIC_REVIEW",
          dimension: "semantic",
          description: entry.semantic.explanation,
          customerValue: null,
          catalogValue: product.productId,
          importance: "informational"
        };
        (entry.semantic.conflictsWithRules ? conflictingRules : matchedRules).push(semanticRule);
        evidence.push(ruleEvidence(semanticRule, product.productId, catalogVersion));
      }
      for (const rule of [...matchedRules, ...conflictingRules]) evidence.push(ruleEvidence(rule, product.productId, catalogVersion));
      const reviewReasons = [...conflicts.reviewReasons];
      if (level === "high") reviewReasons.push("\u9AD8\u5339\u914D\u5019\u9009\u4ECD\u9700\u9500\u552E\u4EBA\u5DE5\u786E\u8BA4\u540E\u65B9\u53EF\u4F5C\u4E3A\u6B63\u5F0F\u7ED3\u679C\u3002");
      if (level === "medium" || level === "low") reviewReasons.push(`${level === "medium" ? "\u4E2D\u7B49" : "\u4F4E"}\u5339\u914D\u5019\u9009\u9700\u8981\u4EBA\u5DE5\u590D\u6838\u3002`);
      if (duplicateModel) reviewReasons.push("\u4EA7\u54C1\u5E93\u5B58\u5728\u91CD\u590D\u6807\u51C6\u5316\u578B\u53F7\uFF0C\u7981\u6B62\u81EA\u52A8\u9009\u62E9\u3002");
      if (versionMismatch) reviewReasons.push("\u4EA7\u54C1\u5E93\u7248\u672C\u4E0D\u4E00\u81F4\uFF0C\u9700\u8981\u6309\u5F53\u524D\u7248\u672C\u91CD\u65B0\u786E\u8BA4\u3002");
      if (closeCandidates.length > 1 && closeCandidates.some((candidate) => candidate.entry.retrieved.product.productId === product.productId)) reviewReasons.push("\u591A\u4E2A\u5019\u9009\u5206\u6570\u63A5\u8FD1\uFF0C\u65E0\u6CD5\u81EA\u52A8\u552F\u4E00\u786E\u5B9A\u3002");
      if (entry.semantic?.conflictsWithRules) reviewReasons.push("AI\u8BED\u4E49\u5EFA\u8BAE\u4E0E\u786E\u5B9A\u6027\u89C4\u5219\u5B58\u5728\u5206\u6B67\uFF0C\u4EE5\u89C4\u5219\u7ED3\u679C\u4E3A\u51C6\u5E76\u9700\u4EBA\u5DE5\u786E\u8BA4\u3002");
      if (input.hasOcrModelAmbiguity && product.model !== request.extractedProduct.model) {
        reviewReasons.push(`OCR\u578B\u53F7\u5B58\u5728\u5B57\u7B26\u6B67\u4E49\uFF1A\u5BA2\u6237\u539F\u59CB\u8BC6\u522B\u4E3A${request.extractedProduct.model ?? "\u7A7A\u503C"}\uFF0C\u4F01\u4E1A\u5019\u9009\u578B\u53F7${product.model}\uFF0C\u9700\u8981\u4EBA\u5DE5\u786E\u8BA4\u3002`);
      }
      const needsHumanReview = level !== "exact" || Boolean(reviewReasons.length);
      return ProductMatchResultSchema.parse({
        schemaVersion: SCHEMA_VERSION,
        matchId: stableMatchId(request.extractedProduct.id, product.productId, catalogVersion),
        extractedProductId: request.extractedProduct.id,
        extractedProductSnapshot: extractedSnapshot2(request.extractedProduct, request.extractionWarnings),
        candidateProductId: product.productId,
        candidateProductSnapshot: candidateSnapshot2(product),
        candidateRank: index + 1,
        status: level === "exact" && !needsHumanReview ? "matched" : "candidate",
        level,
        score: entry.score,
        matchedRules,
        conflictingRules,
        evidence,
        needsHumanReview,
        reviewStatus: needsHumanReview ? "pending" : "not_required",
        reviewReasons: [...new Set(reviewReasons)],
        catalogVersion,
        createdAt
      });
    });
    return {
      schemaVersion: SCHEMA_VERSION,
      results,
      retrievalIssues: retrieval.issues,
      metrics: { catalogVersion, candidateRetrievalMs: retrieval.durationMs, deterministicMatchingMs, semanticReviewMs, totalDurationMs: Math.max(0, Math.round(performance.now() - started)), candidateCount: evaluated.length }
    };
  }
};

// src/real-ai/matching/semantic-provider.ts
var MockSemanticMatchProvider = class {
  constructor(responder = () => []) {
    this.responder = responder;
  }
  responder;
  provider = "mock";
  model = "deterministic-fixture";
  async review(request) {
    const started = performance.now();
    return {
      provider: this.provider,
      model: this.model,
      assessments: this.responder(request),
      durationMs: Math.max(0, Math.round(performance.now() - started)),
      promptTokens: null,
      completionTokens: null
    };
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CandidateRetriever,
  DEFAULT_MATCH_POLICY,
  MatchEngine,
  MockSemanticMatchProvider,
  ProductMatchResultSchema,
  applicationScore,
  assessInputQuality,
  characterBigrams,
  compactName,
  compareSpecifications,
  detectConflicts,
  deterministicScore,
  matchApplication,
  matchModel,
  matchName,
  matchSpecifications,
  nameScore,
  normalizeModel,
  normalizeProductName,
  normalizeSpecificationName,
  normalizeUnicode,
  resolveMatchPolicy,
  scoreLevel,
  setSimilarity,
  textSimilarity,
  uniqueStrings
});
