const AGENTS=new Set(["model-chat","token-intelligence"]);
const DESTINATIONS=new Set(["local_machine","approved_remote"]);
const RETENTION=new Set(["zero","bounded"]);
function invalid(code){return Object.assign(new Error(code),{statusCode:400,code});}
function key(value,kind){
  if(typeof value!=="string"||!/^[A-Za-z0-9._:/-]{1,150}$/.test(value))
    throw invalid("model_policy_"+kind+"_invalid");
  return value;
}
function validate({agent,model,destination,region,retention,allowPrivate,approvedOrigin}){
  if(!AGENTS.has(agent))throw invalid("model_policy_agent_invalid");
  key(model,"model");
  if(!DESTINATIONS.has(destination))throw invalid("model_policy_destination_invalid");
  if(typeof region!=="string"||region.length>120||!/^[A-Za-z0-9._:/-]+$/.test(region))
    throw invalid("model_policy_region_invalid");
  if(!RETENTION.has(retention))throw invalid("model_policy_retention_invalid");
  if(allowPrivate!==true)throw invalid("model_policy_private_consent_required");
  if(destination==="approved_remote" && (
      typeof approvedOrigin!=="string" ||
      !/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{2,5})?$/.test(approvedOrigin)))
    throw invalid("model_policy_remote_origin_invalid");
  if(destination==="local_machine" && approvedOrigin != null)throw invalid("model_policy_local_origin_mismatch");
  return {agent,model,destination,region,retention,allowPrivate:true,
    approvedOrigin:destination==="approved_remote"?approvedOrigin:null};
}
export class TenantModelPolicyRepository{
  constructor(pool){if(!pool)throw Error("tenant_model_policy_requires_postgres");this.pool=pool;}
  async initialize(){
    await this.pool.query(`CREATE TABLE IF NOT EXISTS agent_work_os_model_policies_v1(
      organization_id TEXT NOT NULL,
      agent TEXT NOT NULL,
      model TEXT NOT NULL,
      record JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(organization_id,agent,model)
    )`);
  }
  async list(organizationId){
    const r=await this.pool.query(`SELECT record FROM agent_work_os_model_policies_v1
      WHERE organization_id=$1 ORDER BY agent,model`,[organizationId]);
    return r.rows.map(x=>x.record);
  }
  async get(organizationId,agent,model){
    if(!AGENTS.has(agent))return null;
    key(model,"model");
    const r=await this.pool.query(`SELECT record FROM agent_work_os_model_policies_v1
      WHERE organization_id=$1 AND agent=$2 AND model=$3`,[organizationId,agent,model]);
    return r.rows[0]?.record??null;
  }
  async approve({organizationId,actorId,...params}){
    const policy=validate(params);
    const record={...policy,organizationId,version:"model-policy/v1",
      status:"approved",approvedBy:actorId,approvedAt:new Date().toISOString()};
    await this.pool.query(`INSERT INTO agent_work_os_model_policies_v1
      (organization_id,agent,model,record)
      VALUES($1,$2,$3,$4::jsonb)
      ON CONFLICT(organization_id,agent,model) DO UPDATE
      SET record=EXCLUDED.record,updated_at=CURRENT_TIMESTAMP`,
      [organizationId,policy.agent,policy.model,JSON.stringify(record)]);
    return record;
  }
  async revoke({organizationId,actorId,agent,model}){
    if(!AGENTS.has(agent))throw invalid("model_policy_agent_invalid");
    key(model,"model");
    const prior=await this.get(organizationId,agent,model);
    if(!prior)return null;
    const record={...prior,status:"revoked",revokedBy:actorId,revokedAt:new Date().toISOString()};
    const r=await this.pool.query(`UPDATE agent_work_os_model_policies_v1
      SET record=$4::jsonb,updated_at=CURRENT_TIMESTAMP
      WHERE organization_id=$1 AND agent=$2 AND model=$3
      RETURNING record`,[organizationId,agent,model,JSON.stringify(record)]);
    return r.rows[0].record;
  }
}
export function isModelUseApproved(record,capability){
  if(!record||record.status!=="approved"||record.allowPrivate!==true||
    !capability||capability.name!==record.agent||capability.model!==record.model)return false;
  if(!DESTINATIONS.has(record.destination)||!RETENTION.has(record.retention))return false;
  if(capability.lane!==record.destination)return false;
  // A loopback Token Intelligence gateway may forward to a hosted provider.
  // The daemon's registered/attested upstream must match the tenant policy.
  if(record.agent==="token-intelligence"){
    if(capability.upstreamDestination!==record.destination ||
       capability.upstreamRegion!==record.region ||
       capability.upstreamRetention!==record.retention)return false;
  }
  return true;
}
