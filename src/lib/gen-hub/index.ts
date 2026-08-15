/**
 * gen-hub — public entry point (re-exports only).
 *
 * Kept import-light so legacy routes and API routes can depend on
 * `@/lib/gen-hub` without creating module cycles: the orchestration lives in
 * `runner.ts` (route delegates are passed in explicitly by the caller) and
 * the thin-forward helper in `legacy-forward.ts`.
 */

export { runGenerationJob } from './runner';
export type {
  GenDelegate,
  RouteHandler,
  RunGenerationJobInput,
  RunGenerationJobResult,
} from './runner';
export {
  createGenJob,
  updateGenJob,
  updateGenJobStage,
  getGenJobForUser,
  listGenJobs,
  findGenJobByIdempotencyKey,
  findGenJobByProviderJobId,
  estimateGenJobEtaSeconds,
} from './jobs';
export type { CreateGenJobInput } from './jobs';
export { refundGenJob } from './refund';
export type { RefundableJob, RefundOutcome } from './refund';
export { forwardLegacyGeneration, isGenHubInternalCall } from './legacy-forward';
export { jobFromRow, publicJobView, isMissingJobTableError, GEN_HUB_INTERNAL_HEADER } from './types';
export type { GenerationJob, GenJobKind, GenJobStatus, GenJobStage } from './types';
