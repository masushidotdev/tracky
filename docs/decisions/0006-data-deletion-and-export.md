# Decision 0006: Data deletion requests and JSON exports

Status: superseded in its deletion-request behavior by decision 0024; export format and expiry remain accepted.

## Context

Tracky needs a user-facing privacy surface before a fully automated erasure
pipeline exists. Users must be able to record a deletion request and retrieve a
portable copy of the financial data currently held for their account.

## Decision

- Account deletion remains a soft-delete lifecycle owned by WorkOS. A deletion
  request only records `userSettings.deletionRequestedAtMs`; it does not delete
  application data or alter the WorkOS user immediately.
- The future erasure pipeline, including provider revocation and deletion across
  all user-owned tables, is explicitly out of scope for this release. The
  existing `markUserProfileDeleted` lifecycle seam remains the integration point
  for WorkOS deletion events.
- Data exports use a versioned JSON v1 envelope. Money values retain their
  `{ amountMinor, currency }` shape, with bigint minor units serialized as
  decimal strings.
- Export files expire after seven days. A daily cleanup job removes expired
  blobs and their metadata records.
- Analyst memories expose only their kind and human-readable content. Vector
  embeddings are never included in privacy APIs or export files.

## Consequences

The settings surface can accurately show that a deletion request is pending,
but it must not claim that erasure has completed. JSON v1 is the stable portable
format for this release; additional formats can be derived later without
changing the stored financial representation.
