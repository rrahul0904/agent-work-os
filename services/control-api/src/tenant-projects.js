import crypto from "node:crypto";

const NAME_MAX=120, DESCRIPTION_MAX=2000;
const STATES=new Set(["draft","active","archived"]);
function validationError(code) {
  const error=new Error(code);error.statusCode=400;error.code=code;return error;
}
function validateName(name){
  if(typeof name!=="string"||name.trim().length<3||name.trim().length>NAME_MAX) throw validationError("project_name_invalid");
  return name.trim();
}
function validateDescription(value){
  if(value===undefined)return "";
  if(typeof value!=="string"||value.length>DESCRIPTION_MAX)throw validationError("project_description_invalid");
  return value.trim();
}
function validateRepository(value){
  if(value===undefined || value===null || value==="")return null;
  if(typeof value!=="string"||!/^[A-Za-z0-9_.-]{1,80}\/[A-Za-z0-9_.-]{1,100}$/.test(value) ||
     value.includes(".."))throw validationError("project_repository_invalid");
  return value;
}
function validateId(id){
  if(typeof id!=="string"||!/^project_[0-9a-f-]{36}$/.test(id))throw validationError("project_id_invalid");
  return id;
}
export class TenantProjectRepository{
  constructor(pool){if(!pool)throw new Error("tenant_projects_require_postgres");this.pool=pool;}
  async initialize(){
    await this.pool.query(`CREATE TABLE IF NOT EXISTS agent_work_os_tenant_projects_v1 (
      project_id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      record JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await this.pool.query(`CREATE INDEX IF NOT EXISTS awos_tenant_projects_org_idx
      ON agent_work_os_tenant_projects_v1(organization_id,updated_at DESC)`);
  }
  async list(organizationId,{includeArchived=false}={}){
    const result=await this.pool.query(`SELECT record FROM agent_work_os_tenant_projects_v1
      WHERE organization_id=$1 AND ($2::boolean OR record->>'status'<>'archived')
      ORDER BY updated_at DESC,project_id LIMIT 250`,[organizationId,includeArchived]);
    return result.rows.map(r=>r.record);
  }
  async create({organizationId,actorId,name,description,repository}){
    const now=new Date().toISOString(),project={
      id:"project_"+crypto.randomUUID(),organizationId,name:validateName(name),
      description:validateDescription(description),repository:validateRepository(repository),
      status:"draft",version:1,createdBy:actorId,updatedBy:actorId,
      createdAt:now,updatedAt:now
    };
    await this.pool.query(`INSERT INTO agent_work_os_tenant_projects_v1
      (project_id,organization_id,record) VALUES($1,$2,$3::jsonb)`,
      [project.id,organizationId,JSON.stringify(project)]);
    return project;
  }
  async get(organizationId,id){
    validateId(id);
    const result=await this.pool.query(`SELECT record FROM agent_work_os_tenant_projects_v1
      WHERE organization_id=$1 AND project_id=$2`,[organizationId,id]);
    return result.rows[0]?.record??null;
  }
  async update({organizationId,actorId,id,expectedVersion,name,description,repository,status}){
    validateId(id);
    if(!Number.isInteger(expectedVersion)||expectedVersion<1)throw validationError("project_expected_version_invalid");
    const current=await this.get(organizationId,id);
    if(!current)return null;
    if(current.status==="archived")throw validationError("project_archived_read_only");
    if(status!==undefined&&!STATES.has(status))throw validationError("project_status_invalid");
    if(status==="draft"&&current.status!=="draft")throw validationError("project_cannot_reopen_draft");
    const next={...current,...(name!==undefined?{name:validateName(name)}:{}),
      ...(description!==undefined?{description:validateDescription(description)}:{}),
      ...(repository!==undefined?{repository:validateRepository(repository)}:{}),
      ...(status!==undefined?{status}:{}),version:current.version+1,
      updatedBy:actorId,updatedAt:new Date().toISOString()};
    const result=await this.pool.query(`UPDATE agent_work_os_tenant_projects_v1
      SET record=$4::jsonb,updated_at=CURRENT_TIMESTAMP
      WHERE organization_id=$1 AND project_id=$2 AND (record->>'version')::int=$3
      RETURNING record`,[organizationId,id,expectedVersion,JSON.stringify(next)]);
    if(!result.rowCount)throw Object.assign(new Error("project_version_conflict"),{statusCode:409,code:"project_version_conflict"});
    return result.rows[0].record;
  }
}
