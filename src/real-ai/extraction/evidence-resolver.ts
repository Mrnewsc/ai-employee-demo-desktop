import { SCHEMA_VERSION } from '../types';
import type {
  ExtractionEvidence,
  ExtractionEvidenceItem,
  ExtractionField,
  ExtractionInput,
  ExtractionWarningCode,
  ProviderEvidenceReference,
} from './contracts';

export interface ProviderEvidenceCatalogEntry {
  evidenceId: string;
  text: string;
  type: ExtractionEvidenceItem['kind'];
}

export interface EvidenceResolutionIssue {
  code: Extract<ExtractionWarningCode,
    'UNKNOWN_EVIDENCE_REFERENCE' | 'EVIDENCE_REFERENCE_REPAIRED' | 'EVIDENCE_TEXT_MISMATCH'>;
  field: ExtractionField;
  evidenceId: string;
  message: string;
  recovered: boolean;
}

export interface EvidenceResolutionResult {
  evidence: ExtractionEvidence[];
  issues: EvidenceResolutionIssue[];
}

export function buildProviderEvidenceCatalog(input: ExtractionInput): ProviderEvidenceCatalogEntry[] {
  return input.evidenceItems.map((item) => ({
    evidenceId: item.evidenceId,
    text: item.text,
    type: item.kind,
  }));
}

export class EvidenceResolver {
  private readonly byId: Map<string, ExtractionEvidenceItem>;

  constructor(private readonly input: ExtractionInput) {
    this.byId = new Map(input.evidenceItems.map((item) => [item.evidenceId, item]));
  }

  resolve(evidenceRefs: Record<string, ProviderEvidenceReference[]>): EvidenceResolutionResult {
    const evidence: ExtractionEvidence[] = [];
    const issues: EvidenceResolutionIssue[] = [];

    for (const [fieldName, references] of Object.entries(evidenceRefs)) {
      const field = fieldName as ExtractionField;
      for (const reference of references) {
        const direct = this.byId.get(reference.evidenceId);
        if (direct) {
          if (!containsExactText(direct.text, reference.quote)) {
            issues.push({
              code: 'EVIDENCE_TEXT_MISMATCH',
              field,
              evidenceId: reference.evidenceId,
              message: 'AI引用原文与本地Canonical Evidence不一致',
              recovered: false,
            });
            continue;
          }
          evidence.push(materializeEvidence(this.input.chunkId, field, reference.quote, direct));
          continue;
        }

        const exactMatches = this.input.evidenceItems.filter((item) => normalized(item.text) === normalized(reference.quote));
        if (exactMatches.length === 1) {
          const recovered = exactMatches[0];
          evidence.push(materializeEvidence(this.input.chunkId, field, reference.quote, recovered));
          issues.push({
            code: 'EVIDENCE_REFERENCE_REPAIRED',
            field,
            evidenceId: reference.evidenceId,
            message: '无效Evidence ID已通过当前Chunk内唯一完全一致原文确定性恢复',
            recovered: true,
          });
          continue;
        }

        issues.push({
          code: 'UNKNOWN_EVIDENCE_REFERENCE',
          field,
          evidenceId: reference.evidenceId,
          message: exactMatches.length > 1
            ? '无效Evidence ID对应多个相同原文，禁止猜测来源'
            : '无效Evidence ID无法在当前Chunk中唯一精确恢复',
          recovered: false,
        });
      }
    }

    return { evidence: uniqueEvidence(evidence), issues };
  }
}

function materializeEvidence(
  chunkId: string,
  field: ExtractionField,
  quote: string,
  item: ExtractionEvidenceItem,
): ExtractionEvidence {
  return {
    schemaVersion: SCHEMA_VERSION,
    field,
    text: quote,
    source: item.source,
    evidenceId: item.evidenceId,
    chunkId,
    sourceFile: item.sourceFile,
    confidence: item.confidence,
    originKind: item.kind,
  };
}

function containsExactText(container: string, value: string): boolean {
  const normalizedValue = normalized(value);
  return normalizedValue.length > 0 && normalized(container).includes(normalizedValue);
}

function normalized(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function uniqueEvidence(values: ExtractionEvidence[]): ExtractionEvidence[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.field}:${value.evidenceId}:${value.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
