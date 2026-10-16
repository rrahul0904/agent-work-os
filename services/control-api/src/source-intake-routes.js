function requireBodyFields(body, fields) {
  const missing = fields.filter((field) => body?.[field] === undefined || body?.[field] === null || body?.[field] === '');
  return missing;
}

async function authorize({ principal, identities, organizationId, mutate = false }) {
  if (principal?.kind !== 'user') return { status: 401, error: 'authentication_required' };
  if (!organizationId) return { status: 400, error: 'organization_id_required' };
  const membership = await identities.getMembership(principal.userId, organizationId);
  if (!membership) return { status: 404, error: 'work_item_not_found' };
  if (mutate && membership.role === 'viewer') return { status: 403, error: 'organization_permission_denied' };
  return { membership };
}

function route(pathname) {
  const match = pathname.match(/^\/api\/work-items\/([^/]+)\/source-intake(?:\/(block|resume))?$/);
  if (!match) return null;
  return { workItemId: decodeURIComponent(match[1]), action: match[2] ?? 'inspect' };
}

export async function handleSourceIntakeRequest({
  req,
  res,
  url,
  principal,
  identities,
  workItems,
  sourceIntakeSupervisor,
  readJson,
  json,
  broadcast = () => {},
}) {
  const matched = route(url.pathname);
  if (!matched || principal?.kind !== 'user') return false;

  if (req.method === 'GET' && matched.action === 'inspect') {
    const organizationId = url.searchParams.get('organizationId');
    const auth = await authorize({ principal, identities, organizationId });
    if (auth.error) { json(res, auth.status, { error: auth.error }); return true; }
    const item = await workItems.get(matched.workItemId, organizationId);
    if (!item) { json(res, 404, { error: 'work_item_not_found' }); return true; }
    const result = await sourceIntakeSupervisor.inspect({ workItem: item, organizationId });
    json(res, 200, result);
    return true;
  }

  if (req.method === 'POST' && ['block', 'resume'].includes(matched.action)) {
    const body = await readJson(req);
    const required = matched.action === 'block'
      ? ['organizationId', 'commandId', 'expectedVersion', 'transition', 'accessRequest']
      : ['organizationId', 'commandId', 'expectedVersion', 'accessObservation', 'verificationRunId'];
    const missing = requireBodyFields(body, required);
    if (missing.length) {
      json(res, 400, { error: 'source_intake_fields_required', fields: missing });
      return true;
    }
    if (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 1) {
      json(res, 400, { error: 'expectedVersion_must_be_positive_integer' });
      return true;
    }
    const auth = await authorize({ principal, identities, organizationId: body.organizationId, mutate: true });
    if (auth.error) { json(res, auth.status, { error: auth.error }); return true; }
    const item = await workItems.get(matched.workItemId, body.organizationId);
    if (!item) { json(res, 404, { error: 'work_item_not_found' }); return true; }
    if (item.version !== body.expectedVersion) {
      json(res, 409, { error: 'work_item_version_conflict', expected: body.expectedVersion, actual: item.version });
      return true;
    }

    const actorId = principal.userId;
    const common = {
      workItem: item,
      organizationId: body.organizationId,
      actorId,
      commandId: body.commandId,
    };
    const result = matched.action === 'block'
      ? await sourceIntakeSupervisor.block({
          ...common,
          transition: body.transition,
          accessRequest: body.accessRequest,
        })
      : await sourceIntakeSupervisor.resume({
          ...common,
          accessObservation: body.accessObservation,
          verificationRunId: body.verificationRunId,
        });

    broadcast({ type: 'work.item.updated', workItem: result.workItem });
    json(res, 200, result);
    return true;
  }

  json(res, 405, { error: 'method_not_allowed' });
  return true;
}
