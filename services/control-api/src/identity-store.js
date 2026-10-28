import crypto from "node:crypto";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { createCanonicalId } from "../../../packages/domain/src/index.js";

const scrypt = promisify(crypto.scrypt);
const MIGRATION_URL = new URL("../../../migrations/003_identity_organizations.sql", import.meta.url);
const MACHINE_MIGRATION_URL = new URL("../../../migrations/004_machine_credentials.sql", import.meta.url);
const PASSWORD_PARAMS = { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class IdentityError extends Error {
  constructor(code, status = 400, retryAfterSeconds = null) {
    super(code);
    this.name = "IdentityError";
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class IdentityRepository {
  constructor(pool) {
    if (!pool) throw new Error("postgres_identity_repository_required");
    this.pool = pool;
  }

  async initialize() {
    await this.pool.query(await readFile(MIGRATION_URL, "utf8"));
    await this.pool.query(await readFile(MACHINE_MIGRATION_URL, "utf8"));
  }

  async register({ email, password, organizationName }, transactionClient = null) {
    const normalizedEmail = normalizeEmail(email);
    validatePassword(password);
    const name = validateOrganizationName(organizationName);
    const userId = createCanonicalId("user");
    const organizationId = createCanonicalId("org");
    const salt = crypto.randomBytes(16);
    const passwordHash = await hashPassword(password, salt);
    const rawSessionToken = crypto.randomBytes(32).toString("hex");
    const csrfToken = crypto.randomBytes(32).toString("hex");
    const sessionId = createCanonicalId("session");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

    try {
      const persist = async (client) => {
        await client.query(
          `INSERT INTO agent_work_os_users_v1 (id, email, password_salt, password_hash)
           VALUES ($1, $2, $3, $4)`,
          [userId, normalizedEmail, salt, passwordHash]
        );
        await client.query(
          `INSERT INTO agent_work_os_organizations_v1 (id, name, created_by) VALUES ($1, $2, $3)`,
          [organizationId, name, userId]
        );
        await client.query(
          `INSERT INTO agent_work_os_memberships_v1 (organization_id, user_id, role) VALUES ($1, $2, 'owner')`,
          [organizationId, userId]
        );
        await insertSession(client, { sessionId, userId, rawSessionToken, expiresAt });
      };
      // The first-owner CLI already holds a PostgreSQL advisory lock and an
      // open transaction. Persist on THAT same connection so rollback undoes
      // everything; a separate pool connection would commit prematurely.
      if (transactionClient) await persist(transactionClient);
      else await this.#transaction(persist);
    } catch (error) {
      if (error.code === "23505") throw new IdentityError("identity_email_in_use", 409);
      throw error;
    }

    return {
      user: { id: userId, email: normalizedEmail },
      organization: { id: organizationId, name },
      session: { id: sessionId, token: rawSessionToken, csrfToken, expiresAt },
      memberships: [{ organizationId, organizationName: name, role: "owner" }]
    };
  }

  /**
   * Invitation-only enrollment when public registration is disabled.
   * The invitation is consumed and the new membership/session inserted
   * atomically under a row lock; replay or expiry never creates an account.
   */
  async registerInvited({ email, password, invitationToken }) {
    const normalizedEmail = normalizeEmail(email);
    validatePassword(password);
    if (typeof invitationToken !== "string" || !/^[0-9a-f]{64}$/.test(invitationToken)) {
      throw new IdentityError("invitation_invalid_or_expired", 404);
    }
    const salt = crypto.randomBytes(16);
    const passwordHash = await hashPassword(password, salt);
    const userId = createCanonicalId("user");
    const sessionId = createCanonicalId("session");
    const rawSessionToken = crypto.randomBytes(32).toString("hex");
    const csrfToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    try {
      return await this.#transaction(async (client) => {
        const row = await client.query(
          `SELECT invitation.*, org.name AS organization_name
           FROM agent_work_os_invitations_v1 invitation
           JOIN agent_work_os_organizations_v1 org ON org.id=invitation.organization_id
           WHERE invitation.token_hash=$1 FOR UPDATE OF invitation`,
          [digestToken(invitationToken)]
        );
        const invitation = row.rows[0];
        if (!invitation || invitation.accepted_at ||
            new Date(invitation.expires_at).valueOf() <= Date.now() ||
            invitation.email !== normalizedEmail) {
          throw new IdentityError("invitation_invalid_or_expired", 404);
        }
        await client.query(
          `INSERT INTO agent_work_os_users_v1 (id,email,password_salt,password_hash)
           VALUES($1,$2,$3,$4)`,[userId,normalizedEmail,salt,passwordHash]
        );
        await client.query(
          `INSERT INTO agent_work_os_memberships_v1(organization_id,user_id,role)
           VALUES($1,$2,$3)`,[invitation.organization_id,userId,invitation.role]
        );
        await client.query(
          `UPDATE agent_work_os_invitations_v1 SET accepted_at=CURRENT_TIMESTAMP
           WHERE token_hash=$1`,[digestToken(invitationToken)]
        );
        await insertSession(client,{sessionId,userId,rawSessionToken,expiresAt});
        return {
          user:{id:userId,email:normalizedEmail},
          session:{id:sessionId,token:rawSessionToken,csrfToken,expiresAt},
          memberships:[{organizationId:invitation.organization_id,
            organizationName:invitation.organization_name,role:invitation.role}]
        };
      });
    } catch(error) {
      if (error.code === "23505") throw new IdentityError("existing_account_sign_in_to_accept",409);
      throw error;
    }
  }

  async login({ email, password }) {
    const normalizedEmail = normalizeEmail(email);
    if (typeof password !== "string" || password.length > 1024) throw new IdentityError("invalid_credentials", 401);
    const result = await this.pool.query(
      `SELECT id, email, password_salt, password_hash FROM agent_work_os_users_v1 WHERE email = $1`,
      [normalizedEmail]
    );
    const row = result.rows[0];
    const salt = row?.password_salt ?? Buffer.from("0000000000000000", "hex");
    const expected = row?.password_hash ?? Buffer.alloc(32);
    const actual = await hashPassword(password, salt);
    if (!row || !crypto.timingSafeEqual(actual, expected)) throw new IdentityError("invalid_credentials", 401);

    const rawSessionToken = crypto.randomBytes(32).toString("hex");
    const csrfToken = crypto.randomBytes(32).toString("hex");
    const sessionId = createCanonicalId("session");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    await insertSession(this.pool, { sessionId, userId: row.id, rawSessionToken, expiresAt });
    return {
      user: { id: row.id, email: row.email },
      session: { id: sessionId, token: rawSessionToken, csrfToken, expiresAt },
      memberships: await this.listMemberships(row.id)
    };
  }

  async consumeAuthAttempt(key, { limit, windowMs }) {
    if (typeof key !== "string" || !Number.isInteger(limit) || limit < 1 || !Number.isInteger(windowMs) || windowMs < 1) {
      throw new Error("auth_rate_limit_configuration_invalid");
    }
    const keyHash = digestToken(key);
    const result = await this.pool.query(
      `INSERT INTO agent_work_os_auth_rate_limits_v1 AS existing (key_hash, window_started_at, attempt_count)
       VALUES ($1, CURRENT_TIMESTAMP, 1)
       ON CONFLICT (key_hash) DO UPDATE SET
         window_started_at = CASE
           WHEN existing.window_started_at + ($2 * INTERVAL '1 millisecond') <= CURRENT_TIMESTAMP THEN CURRENT_TIMESTAMP
           ELSE existing.window_started_at
         END,
         attempt_count = CASE
           WHEN existing.window_started_at + ($2 * INTERVAL '1 millisecond') <= CURRENT_TIMESTAMP THEN 1
           ELSE existing.attempt_count + 1
         END
       RETURNING attempt_count, window_started_at`,
      [keyHash, windowMs]
    );
    if (crypto.randomInt(100) === 0) {
      await this.pool.query("DELETE FROM agent_work_os_auth_rate_limits_v1 WHERE window_started_at < CURRENT_TIMESTAMP - INTERVAL '1 day'");
    }
    const row = result.rows[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((new Date(row.window_started_at).getTime() + windowMs - Date.now()) / 1000));
    if (Number(row.attempt_count) > limit) throw new IdentityError("auth_rate_limit_exceeded", 429, retryAfterSeconds);
  }

  async createMachineCredential({ organizationId, actorId, machineId, name }) {
    const membership = await this.getMembership(actorId, organizationId);
    if (!membership) throw new IdentityError("organization_not_found", 404);
    if (!["owner", "admin"].includes(membership.role)) throw new IdentityError("organization_permission_denied", 403);
    if (typeof machineId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(machineId)) throw new IdentityError("machine_id_invalid");
    if (typeof name !== "string" || !name.trim() || name.trim().length > 120) throw new IdentityError("machine_name_invalid");
    const token = crypto.randomBytes(32).toString("hex");
    const id = createCanonicalId("credential");
    try {
      await this.pool.query(
        `INSERT INTO agent_work_os_machine_credentials_v1
           (id, token_hash, organization_id, machine_id, name, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, digestToken(token), organizationId, machineId.trim(), name.trim(), actorId]
      );
    } catch (error) {
      if (error.code === "23505") throw new IdentityError("machine_id_already_registered", 409);
      throw error;
    }
    return { id, token, organizationId, machineId: machineId.trim(), name: name.trim() };
  }

  async rotateMachineCredential({ organizationId, actorId, credentialId }) {
    const membership = await this.getMembership(actorId, organizationId);
    if (!membership) throw new IdentityError("organization_not_found", 404);
    if (!["owner", "admin"].includes(membership.role)) throw new IdentityError("organization_permission_denied", 403);
    const token = crypto.randomBytes(32).toString("hex");
    const result = await this.pool.query(
      `UPDATE agent_work_os_machine_credentials_v1
       SET token_hash = $1, last_used_at = NULL
       WHERE id = $2 AND organization_id = $3 AND revoked_at IS NULL
       RETURNING machine_id`,
      [digestToken(token), credentialId, organizationId]
    );
    if (!result.rowCount) throw new IdentityError("machine_credential_not_found", 404);
    return { id: credentialId, token, machineId: result.rows[0].machine_id };
  }

  async authenticateMachine(token) {
    if (!/^[0-9a-f]{64}$/.test(token ?? "")) return null;
    const result = await this.pool.query(
      `UPDATE agent_work_os_machine_credentials_v1 SET last_used_at = CURRENT_TIMESTAMP
       WHERE token_hash = $1 AND revoked_at IS NULL
       RETURNING id, organization_id, machine_id, name`,
      [digestToken(token)]
    );
    const row = result.rows[0];
    return row ? { kind: "machine", credentialId: row.id, organizationId: row.organization_id, machineId: row.machine_id, name: row.name } : null;
  }

  async revokeMachineCredential({ organizationId, actorId, credentialId }) {
    const membership = await this.getMembership(actorId, organizationId);
    if (!membership) throw new IdentityError("organization_not_found", 404);
    if (!["owner", "admin"].includes(membership.role)) throw new IdentityError("organization_permission_denied", 403);
    const result = await this.pool.query(
      `UPDATE agent_work_os_machine_credentials_v1 SET revoked_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND organization_id = $2 AND revoked_at IS NULL`,
      [credentialId, organizationId]
    );
    if (!result.rowCount) throw new IdentityError("machine_credential_not_found", 404);
    const credential = await this.pool.query("SELECT machine_id FROM agent_work_os_machine_credentials_v1 WHERE id = $1", [credentialId]);
    return { id: credentialId, machineId: credential.rows[0]?.machine_id, revoked: true };
  }

  async authenticate(rawToken) {
    if (!/^[0-9a-f]{64}$/.test(rawToken ?? "")) return null;
    const result = await this.pool.query(
      `SELECT session.id AS session_id, session.expires_at, user_row.id AS user_id, user_row.email
       FROM agent_work_os_auth_sessions_v1 AS session
       JOIN agent_work_os_users_v1 AS user_row ON user_row.id = session.user_id
       WHERE session.token_hash = $1 AND session.revoked_at IS NULL AND session.expires_at > CURRENT_TIMESTAMP`,
      [digestToken(rawToken)]
    );
    const row = result.rows[0];
    return row ? {
      kind: "user",
      userId: row.user_id,
      email: row.email,
      sessionId: row.session_id,
      expiresAt: new Date(row.expires_at).toISOString()
    } : null;
  }

  async revokeSession(rawToken) {
    if (!/^[0-9a-f]{64}$/.test(rawToken ?? "")) return false;
    const result = await this.pool.query(
      `UPDATE agent_work_os_auth_sessions_v1 SET revoked_at = CURRENT_TIMESTAMP
       WHERE token_hash = $1 AND revoked_at IS NULL`,
      [digestToken(rawToken)]
    );
    return result.rowCount > 0;
  }

  async listMemberships(userId) {
    const result = await this.pool.query(
      `SELECT membership.organization_id, organization.name, membership.role
       FROM agent_work_os_memberships_v1 AS membership
       JOIN agent_work_os_organizations_v1 AS organization ON organization.id = membership.organization_id
       WHERE membership.user_id = $1 ORDER BY organization.name, organization.id`,
      [userId]
    );
    return result.rows.map((row) => ({ organizationId: row.organization_id, organizationName: row.name, role: row.role }));
  }

  async getMembership(userId, organizationId) {
    const result = await this.pool.query(
      `SELECT membership.organization_id, organization.name, membership.role
       FROM agent_work_os_memberships_v1 AS membership
       JOIN agent_work_os_organizations_v1 AS organization ON organization.id = membership.organization_id
       WHERE membership.user_id = $1 AND membership.organization_id = $2`,
      [userId, organizationId]
    );
    const row = result.rows[0];
    return row ? { organizationId: row.organization_id, organizationName: row.name, role: row.role } : null;
  }

  async createInvitation({ organizationId, actorId, email, role }) {
    const normalizedEmail = normalizeEmail(email);
    if (!new Set(["admin", "member", "viewer"]).has(role)) throw new IdentityError("invitation_role_invalid");
    const membership = await this.getMembership(actorId, organizationId);
    if (!membership) throw new IdentityError("organization_not_found", 404);
    if (membership.role !== "owner" && !(membership.role === "admin" && ["member", "viewer"].includes(role))) {
      throw new IdentityError("organization_permission_denied", 403);
    }
    const existing = await this.pool.query(
      "SELECT 1 FROM agent_work_os_memberships_v1 AS membership JOIN agent_work_os_users_v1 AS user_row ON user_row.id = membership.user_id WHERE membership.organization_id = $1 AND user_row.email = $2",
      [organizationId, normalizedEmail]
    );
    if (existing.rowCount) throw new IdentityError("user_already_organization_member", 409);
    const rawToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();
    await this.pool.query(
      `INSERT INTO agent_work_os_invitations_v1
         (token_hash, organization_id, email, role, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [digestToken(rawToken), organizationId, normalizedEmail, role, actorId, expiresAt]
    );
    return { token: rawToken, email: normalizedEmail, role, expiresAt };
  }

  async acceptInvitation(rawToken, userId) {
    if (!/^[0-9a-f]{64}$/.test(rawToken ?? "")) throw new IdentityError("invitation_invalid", 404);
    return this.#transaction(async (client) => {
      const invitationResult = await client.query(
        `SELECT invitation.*, user_row.email AS user_email, organization.name AS organization_name
         FROM agent_work_os_invitations_v1 AS invitation
         JOIN agent_work_os_users_v1 AS user_row ON user_row.id = $2
         JOIN agent_work_os_organizations_v1 AS organization ON organization.id = invitation.organization_id
         WHERE invitation.token_hash = $1 FOR UPDATE OF invitation`,
        [digestToken(rawToken), userId]
      );
      const invitation = invitationResult.rows[0];
      if (!invitation || invitation.accepted_at || new Date(invitation.expires_at) <= new Date()) {
        throw new IdentityError("invitation_invalid_or_expired", 404);
      }
      if (invitation.email !== invitation.user_email) throw new IdentityError("invitation_email_mismatch", 403);
      await client.query(
        `INSERT INTO agent_work_os_memberships_v1 (organization_id, user_id, role)
         VALUES ($1, $2, $3) ON CONFLICT (organization_id, user_id) DO NOTHING`,
        [invitation.organization_id, userId, invitation.role]
      );
      await client.query("UPDATE agent_work_os_invitations_v1 SET accepted_at = CURRENT_TIMESTAMP WHERE token_hash = $1", [digestToken(rawToken)]);
      return { organizationId: invitation.organization_id, organizationName: invitation.organization_name, role: invitation.role };
    });
  }

  async #transaction(operation) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally {
      client.release();
    }
  }
}

async function insertSession(client, { sessionId, userId, rawSessionToken, expiresAt }) {
  await client.query(
    `INSERT INTO agent_work_os_auth_sessions_v1 (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [sessionId, userId, digestToken(rawSessionToken), expiresAt]
  );
}

async function hashPassword(password, salt) {
  return scrypt(password, salt, 32, PASSWORD_PARAMS);
}

function digestToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function normalizeEmail(email) {
  if (typeof email !== "string") throw new IdentityError("email_invalid");
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new IdentityError("email_invalid");
  return normalized;
}

function validatePassword(password) {
  if (typeof password !== "string" || password.length < 12 || password.length > 1024) throw new IdentityError("password_must_be_12_to_1024_characters");
}

function validateOrganizationName(name) {
  if (typeof name !== "string") throw new IdentityError("organization_name_invalid");
  const normalized = name.trim();
  if (!normalized || normalized.length > 120) throw new IdentityError("organization_name_invalid");
  return normalized;
}
