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
  if (principal?.kind !== "user") return false;
  const organizationId = event?.workItem?.organizationId ??
    event?.capabilityVerification?.organizationId ??
    event?.run?.organizationId ?? event?.session?.organizationId ??
    event?.machine?.organizationId;
  if (!organizationId || !principal.organizationIds?.includes(organizationId)) return false;
  if (event.session && !isSessionOwnedBy(principal,event.session)) return false;
  return true;
}
