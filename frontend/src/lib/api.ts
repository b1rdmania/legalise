// Barrel for the Legalise backend API client (Fluff C1 / audit M2.1).
//
// The implementation lives in `lib/api/*`, split by domain. This file
// re-exports every public symbol so existing `../lib/api` import paths
// keep resolving unchanged — zero consumer churn. New code may import
// from the domain modules directly.

export * from "./api/_core";
export * from "./api/auth";
export * from "./api/matters";
export * from "./api/documents";
export * from "./api/assistant";
export * from "./api/modules";
export * from "./api/signoffs";
export * from "./api/external";
export * from "./api/audit";
export * from "./api/admin";
export * from "./api/settings";
