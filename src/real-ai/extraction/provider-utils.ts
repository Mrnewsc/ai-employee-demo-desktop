import type { ProviderExtractionPayload } from './contracts';
import { ProductExtractionError } from './errors';
import { ProviderExtractionPayloadSchema } from './schemas';
import { mapZodIssues } from './schema-validation-diagnostics';

export function parseProviderPayload(content: string): ProviderExtractionPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new ProductExtractionError('AI_INVALID_JSON', 'AI返回的JSON无法解析', { cause: error });
  }
  const validated = ProviderExtractionPayloadSchema.safeParse(parsed);
  if (!validated.success) {
    throw new ProductExtractionError('AI_SCHEMA_INVALID', 'AI返回结果不符合产品提取Schema', {
      cause: validated.error,
      schemaIssues: mapZodIssues(validated.error.issues, parsed),
      diagnostics: {
        httpStatus: null,
        responseContentType: null,
        responseBodyLength: null,
        responseKind: null,
        providerRequestId: null,
        errorStage: 'schema',
      },
    });
  }
  return validated.data as ProviderExtractionPayload;
}
