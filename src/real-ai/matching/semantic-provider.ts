import type { SemanticMatchProvider, SemanticMatchRequest, SemanticMatchResponse } from './contracts';

export class MockSemanticMatchProvider implements SemanticMatchProvider {
  readonly provider = 'mock';
  readonly model = 'deterministic-fixture';

  constructor(private readonly responder: (request: SemanticMatchRequest) => SemanticMatchResponse['assessments'] = () => []) {}

  async review(request: SemanticMatchRequest): Promise<SemanticMatchResponse> {
    const started = performance.now();
    return {
      provider: this.provider,
      model: this.model,
      assessments: this.responder(request),
      durationMs: Math.max(0, Math.round(performance.now() - started)),
      promptTokens: null,
      completionTokens: null,
    };
  }
}
