import type { PublicSourceStatus } from './contracts';

export class PublicSearchProviderError extends Error {
  constructor(
    readonly status: Exclude<PublicSourceStatus, 'AVAILABLE'>,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'PublicSearchProviderError';
  }
}

