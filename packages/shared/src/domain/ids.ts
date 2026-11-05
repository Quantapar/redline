/** Branded id helpers so ids of different entities are not interchangeable. */
export type Brand<T, B extends string> = T & { readonly __brand: B };

export type RepositoryId = Brand<string, 'RepositoryId'>;
export type ScanId = Brand<string, 'ScanId'>;
export type CandidateId = Brand<string, 'CandidateId'>;
export type FindingId = Brand<string, 'FindingId'>;
export type RefereeRunId = Brand<string, 'RefereeRunId'>;
export type FixId = Brand<string, 'FixId'>;
export type RecipeId = Brand<string, 'RecipeId'>;

export const asId = <B extends string>(v: string): Brand<string, B> => v as Brand<string, B>;
