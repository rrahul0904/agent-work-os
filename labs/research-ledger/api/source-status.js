import { lookup } from 'node:dns/promises';
import { createHash } from 'node:crypto';

const MAX_URLS=8,MAX_BYTES=64*1024,MAX_REDIRECTS=4;
function isPrivateV4(ip){const p=ip.split('.').map(Number);if(p.length!==4||p.some(n=>!Number.isInteger(n)||n<0||n>255))return false;return p[0]===10||p[0]===127||p[0]===0||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168)||(p[0]===100&&p[1]>=64&&p[1]<=127)||p[0]>=224;}
function isPrivateV6(ip){const s=ip.toLowerCase();return s==='::1'||s==='::'||s.startsWith('fe80:')||s.startsWith('fc')||s.startsWith('fd')||s.startsWith('::ffff:127.')||s.startsWith('::ffff:10.')||s.startsWith('::ffff:192.168.');}
export function validatePublicHttpUrl(raw){
  const url=new URL(String(raw));
  if(!['http:','https:'].includes(url.protocol))throw new Error('Only public HTTP(S) URLs are allowed');
  if(url.username||url.password)throw new Error('Credential-bearing URLs are refused');
  const host=url.hostname.toLowerCase().replace(/\.$/,'');
  if(!host||host==='localhost'||host.endsWith('.local')||host.endsWith('.internal')||host.endsWith('.localhost'))throw new Error('Local/private hostnames are refused');
  if(isPrivateV4(host)||isPrivateV6(host))throw new Error('Private network destinations are refused');
  return url;
}
async function assertPublicDns(url){
  const answers=await lookup(url.hostname,{all:true,verbatim:true});
  if(!answers.length)throw new Error('Hostname did not resolve');
  for(const a of answers){if((a.family===4&&isPrivateV4(a.address))||(a.family===6&&isPrivateV6(a.address)))throw new Error('Hostname resolves to a private network destination');}
}
async function boundedFetch(raw){
  let url=validatePublicHttpUrl(raw);
  for(let redirects=0;redirects<=MAX_REDIRECTS;redirects++){
    await assertPublicDns(url);
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),7000);
    let response;
    try{response=await fetch(url,{method:'GET',redirect:'manual',headers:{'User-Agent':'ResearchLedger-Freshness/0.3','Range':`bytes=0-${MAX_BYTES-1}`,'Accept':'text/html,text/plain,application/json,application/pdf;q=0.8,*/*;q=0.2'},signal:controller.signal});}finally{clearTimeout(timer)}
    if([301,302,303,307,308].includes(response.status)){
      const location=response.headers.get('location');if(!location)throw new Error('Redirect missing location');url=validatePublicHttpUrl(new URL(location,url).toString());continue;
    }
    const reader=response.body?.getReader();let size=0;const chunks=[];
    if(reader){while(size<MAX_BYTES){const {done,value}=await reader.read();if(done)break;const remain=MAX_BYTES-size;const slice=value.length>remain?value.slice(0,remain):value;chunks.push(slice);size+=slice.length;if(slice.length<value.length)break;}try{await reader.cancel()}catch{}}
    const body=Buffer.concat(chunks.map(x=>Buffer.from(x)));const etag=response.headers.get('etag')||'';const lastModified=response.headers.get('last-modified')||'';const contentLength=response.headers.get('content-length')||'';const contentType=response.headers.get('content-type')||'';
    const fingerprint=createHash('sha256').update(`${response.status}\n${etag}\n${lastModified}\n${contentLength}\n${contentType}\n`).update(body).digest('hex');
    return {url:String(url),ok:response.ok,status:response.status,etag,lastModified,contentLength,contentType,fingerprint,sampledBytes:body.length,fetchedAt:new Date().toISOString()};
  }
  throw new Error('Too many redirects');
}
export default async function handler(req,res){
  if(req.method==='GET')return res.status(200).json({service:'source-status',maxUrls:MAX_URLS,maxSampleBytes:MAX_BYTES});
  if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
  const urls=Array.isArray(req.body?.urls)?req.body.urls.slice(0,MAX_URLS):[];if(!urls.length)return res.status(400).json({error:'At least one URL is required'});
  const results=[];
  for(const raw of urls){try{results.push(await boundedFetch(raw));}catch(error){results.push({url:String(raw),ok:false,error:error.name==='AbortError'?'Request timed out':error.message,fetchedAt:new Date().toISOString()});}}
  return res.status(200).json({results});
}
