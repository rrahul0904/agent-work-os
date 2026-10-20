import {emptyStore,addCard,logEvent,statusAt,rhythmFor,attentionAt,millisecondsPerDay,decodeStore} from './engine.mjs';
const KEY='beesnote-last-done-prototype-v1';
let store=emptyStore(), readOnly=false;
const saved=localStorage.getItem(KEY);
if(saved) try { store=decodeStore(saved); }
catch { readOnly=true;document.getElementById('notice').textContent='Stored data is invalid. This demo is read-only to preserve it; export browser storage before proceeding.'; }
const id=()=>globalThis.crypto?.randomUUID?.().replaceAll('-','') || 'id'+Date.now().toString(36)+Math.random().toString(36).slice(2,10);
const element=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;};
const ago=ms=>{const m=Math.floor(ms/60000);if(m<1)return 'just now';if(m<60)return String(m)+'m ago';if(m<1440)return String(Math.floor(m/60))+'h ago';return String(Math.floor(m/1440))+'d ago';};
function persist(next){if(readOnly)throw Error('Storage is read-only');localStorage.setItem(KEY,JSON.stringify(next));store=next;render();}
function render(){const root=document.getElementById('cards');root.replaceChildren();const now=new Date().toISOString();
 if(!store.cards.length){root.append(element('p','empty','No cards yet. Add your first activity above.'));return;}
 for(const card of store.cards){const current=statusAt(store,card.id,now),r=rhythmFor(store,card.id,now),due=attentionAt(store,card.id,now);const article=element('article','card');const header=element('div','card-head');header.append(element('h2','',card.title),element('span','status'+(due.due?' overdue':''),due.due?'Possibly due':'Recorded'));article.append(header);
 article.append(element('p','state',card.states.find(s=>s.id===current.stateId)?.label||'No record yet'));
 article.append(element('p','elapsed',current.elapsedMs===null?'Nothing logged yet':ago(current.elapsedMs)));
 article.append(element('p','meta',r.typicalIntervalMs?'Typical gap: '+(r.typicalIntervalMs/millisecondsPerDay).toFixed(1)+' days':'Add 3 completions for rhythm insights'));
 const actions=element('div','actions');for(const state of card.states){const button=element('button','',state.label);button.disabled=readOnly;button.addEventListener('click',()=>{try{persist(logEvent(store,{id:id(),cardId:card.id,stateId:state.id,at:new Date().toISOString()}));}catch(err){alert(err.message);}});actions.append(button);}article.append(actions);root.append(article);
 }}
document.getElementById('create').addEventListener('submit',event=>{event.preventDefault();const input=document.getElementById('title');try{persist(addCard(store,{id:id(),title:input.value,states:[{id:'done',label:'Done'}]}));input.value='';}catch(err){alert(err.message);}});
document.getElementById('export').addEventListener('click',()=>{const blob=new Blob([JSON.stringify(store,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='beesnote-last-done-export.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
render();
