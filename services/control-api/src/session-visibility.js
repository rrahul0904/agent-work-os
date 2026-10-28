/**
 * Account sessions are private by default. Tenant membership authorizes
 * shared project metadata, not access to another person's prompts, tool
 * output or agent control channel. A later collaboration feature must
 * introduce explicit grants instead of silently widening this rule.
 */
export function isSessionOwnedBy(principal, session) {
  return principal?.kind === "user" &&
    typeof principal.userId === "string" && principal.userId.length > 0 &&
    typeof session?.createdBy === "string" && session.createdBy.length > 0 &&
    session.createdBy === principal.userId;
}

export function canReceiveClientEvent(principal, event) {
  if (principal?.kind === "legacy") return true;
  if (principal?.kind !== "user" || !Array.isArray(principal.organizationIds)) return false;

  // An event envelope can contain multiple independent records. Checking
  // only the first organization allows mixed-tenant payloads to cross the
  // WebSocket/replay boundary. Reject disagreement even when the recipient
  // belongs to both organizations: one event must have exactly one tenant.
  const records = [
    event?.workItem,
    event?.capabilityVerification,
    event?.run,
    event?.session,
    event?.machine
  ].filter((record) => record !== undefined && record !== null);
  if (records.length === 0) return false;
  const organizationId = records[0]?.organizationId;
  if (typeof organizationId !== "string" || !organizationId ||
      !principal.organizationIds.includes(organizationId) ||
      records.some((record) => record?.organizationId !== organizationId)) return false;
  if (event.session && !isSessionOwnedBy(principal, event.session)) return false;
  return true;
}
