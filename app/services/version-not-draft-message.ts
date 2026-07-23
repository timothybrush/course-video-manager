/**
 * The user-facing message carried by VersionNotDraftError (issue #1403).
 *
 * Shared between the server (db-service-errors sets it as the error's
 * `message`, which route-action serializes as the 409 body) and the browser
 * (clients match on it to tell the terminal "version was published while you
 * were editing" 409 apart from other 409s, then surface it and force a reload
 * into the new Draft).
 */
export const VERSION_NOT_DRAFT_MESSAGE =
  "This version was published while you were editing — reload to continue in the new Draft.";
