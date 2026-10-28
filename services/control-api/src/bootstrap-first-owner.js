/** First installation only. Not an HTTP route. The caller must independently
 * authorize an operator-provisioned instance. Never print the password/session.
 */
export async function bootstrapFirstOwner({pool, identities, email, password, organizationName, approval}) {
  if (approval !== "YES_CREATE_FIRST_OWNER") throw new Error("FIRST_OWNER_BOOTSTRAP_EXPLICIT_APPROVAL_REQUIRED");
  if (typeof email !== "string" || !email.includes("@") ||
      typeof password !== "string" || !organizationName) {
    throw new Error("FIRST_OWNER_BOOTSTRAP_INPUT_REQUIRED");
  }
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('awos-initial-owner-v1'))");
    const {rows}=await client.query(`SELECT
       (SELECT COUNT(*)::integer FROM agent_work_os_organizations_v1) AS organizations,
       (SELECT COUNT(*)::integer FROM agent_work_os_users_v1) AS users,
       (SELECT COUNT(*)::integer FROM agent_work_os_memberships_v1) AS memberships`);
    if ((Number(rows[0]?.organizations)||0)!==0 ||
        (Number(rows[0]?.users)||0)!==0 ||
        (Number(rows[0]?.memberships)||0)!==0) {
      throw new Error("FIRST_OWNER_BOOTSTRAP_NOT_EMPTY");
    }
    const account=await identities.register({email,password,organizationName});
    await client.query("COMMIT");
    return {created:true,organizationId:account.organization.id,userId:account.user.id};
  } catch(error) {
    try {await client.query("ROLLBACK");} catch{}
    throw error;
  } finally {client.release();}
}
