import type { ExtractionEvidence } from './contracts';

const IMPLEMENTATION_REQUIREMENT = /(接入|安装|兼容|接口|交付|现场改造|现场施工|预留|对接|改造现有|兼容现有|PLC)/i;
const ACTUAL_APPLICATION = /(用于|应用于|适用于|工件|零件|配件|喷涂|清洗|包装|装配|加工|行业|场景|用途)/i;

export interface ApplicationGuardResult {
  application: string | null;
  notes: string[];
  evidence: ExtractionEvidence[];
  reclassified: boolean;
  movedEvidence: ExtractionEvidence[];
}

export function guardApplicationSemantic(
  application: string | null,
  notes: string[],
  evidence: ExtractionEvidence[],
): ApplicationGuardResult {
  if (!application) {
    return { application, notes, evidence, reclassified: false, movedEvidence: [] };
  }
  const applicationEvidence = evidence.filter((item) => item.field === 'application');
  const combined = [application, ...applicationEvidence.map((item) => item.text)].join(' ');
  if (!IMPLEMENTATION_REQUIREMENT.test(combined) || ACTUAL_APPLICATION.test(combined)) {
    return { application, notes, evidence, reclassified: false, movedEvidence: [] };
  }

  const movedEvidence = applicationEvidence.map((item) => ({ ...item, field: 'notes' as const }));
  const retainedEvidence = evidence.filter((item) => item.field !== 'application');
  return {
    application: null,
    notes: [...new Set([...notes, application])],
    evidence: [...retainedEvidence, ...movedEvidence],
    reclassified: true,
    movedEvidence,
  };
}
