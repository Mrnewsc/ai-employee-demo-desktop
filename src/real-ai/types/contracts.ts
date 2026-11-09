export const SCHEMA_VERSION = '1.0' as const;

export type SchemaVersion = typeof SCHEMA_VERSION;

export interface VersionedContract {
  schemaVersion: SchemaVersion;
}

export interface PdfSourceLocation extends VersionedContract {
  kind: 'pdf';
  page: number;
  bbox?: [number, number, number, number];
}

export interface DocxSourceLocation extends VersionedContract {
  kind: 'docx';
  paragraph?: number;
  table?: number;
  row?: number;
  cell?: number;
  image?: number;
}

export interface SheetSourceLocation extends VersionedContract {
  kind: 'sheet';
  sheet: string;
  cell?: string;
  range?: string;
  row?: number;
  column?: number;
}

export interface ImageSourceLocation extends VersionedContract {
  kind: 'image';
  imageId: string;
  bbox?: [number, number, number, number];
}

export type SourceLocation =
  | PdfSourceLocation
  | DocxSourceLocation
  | SheetSourceLocation
  | ImageSourceLocation;

export type DocumentBlockType =
  | 'heading'
  | 'paragraph'
  | 'list-item'
  | 'table-caption'
  | 'ocr-line';

export interface DocumentBlock extends VersionedContract {
  id: string;
  type: DocumentBlockType;
  text: string;
  source: SourceLocation;
  confidence?: number;
}

export interface ParsedCell extends VersionedContract {
  value: string | number | boolean | null;
  displayValue: string;
  formula?: string;
  source: SourceLocation;
}

export interface ParsedTable extends VersionedContract {
  id: string;
  title?: string;
  rows: ParsedCell[][];
  source: SourceLocation;
  confidence: number;
  headerRowCount?: number;
}

export interface ParsedImage extends VersionedContract {
  id: string;
  mimeType: string;
  width?: number;
  height?: number;
  byteSize?: number;
  sha256?: string;
  role: 'embedded' | 'page-render' | 'source-image';
  source: SourceLocation;
  ocrText?: string;
  ocrConfidence?: number;
}

export type ParseWarningCode =
  | 'table_structure_low_confidence'
  | 'ocr_low_confidence'
  | 'ocr_character_ambiguity'
  | 'page_without_text'
  | 'formula_without_cached_value'
  | 'unsupported_document_feature'
  | 'source_location_approximate'
  | 'parser_message';

export interface ParseWarning extends VersionedContract {
  code: ParseWarningCode;
  message: string;
  severity: 'info' | 'warning';
  source?: SourceLocation;
}

export type ParsedFileType = 'pdf' | 'docx' | 'xlsx' | 'xls' | 'image';

export interface ParsedDocumentMetadata extends VersionedContract {
  pageCount?: number;
  sheetCount?: number;
  sheetNames?: string[];
  paragraphCount?: number;
  parser: string;
  parserVersion?: string;
  parseDurationMs: number;
  peakRssBytes?: number;
  [key: string]: unknown;
}

export interface ParsedDocument extends VersionedContract {
  fileId: string;
  fileName: string;
  fileType: ParsedFileType;
  mimeType: string;
  size: number;
  sha256: string;
  rawText: string;
  blocks: DocumentBlock[];
  tables: ParsedTable[];
  images: ParsedImage[];
  metadata: ParsedDocumentMetadata;
  warnings: ParseWarning[];
}

export interface ExtractedQuantity extends VersionedContract {
  value: number | null;
  unit: string | null;
  raw: string | null;
}

export interface ProductEvidence extends VersionedContract {
  field: string;
  text: string;
  source: SourceLocation;
}

export interface ExtractedProduct extends VersionedContract {
  id: string;
  productName: string | null;
  model: string | null;
  specifications: Record<string, string>;
  quantity: ExtractedQuantity;
  material: string | null;
  process: string | null;
  application: string | null;
  notes: string[];
  sourceFile: string;
  sourceLocations: SourceLocation[];
  evidence: ProductEvidence[];
  confidence: number;
  fieldConfidence: Record<string, number>;
  needsHumanReview: boolean;
}

export interface ProductRecord extends VersionedContract {
  productId: string;
  productName: string;
  model: string;
  category: string;
  specifications: Record<string, string>;
  applications: string[];
  keywords: string[];
  synonyms: string[];
  description: string;
  status: 'active' | 'inactive';
  version: number;
  updatedAt: string;
}

export type ProductMatchLevel = 'exact' | 'high' | 'medium' | 'low' | 'none';

export interface ProductMatchEvidence extends VersionedContract {
  dimension: 'model' | 'name' | 'specification' | 'application' | 'semantic';
  description: string;
  weight?: number;
  source?: SourceLocation;
}

export interface ProductMatchResult extends VersionedContract {
  extractedProductId: string;
  candidateProductId: string | null;
  level: ProductMatchLevel;
  score: number | null;
  matchedRules: string[];
  conflictingRules: string[];
  evidence: ProductMatchEvidence[];
  needsHumanReview: boolean;
  reviewReasons: string[];
}
