const APP_URL = 'https://REPLACE_WITH_DEPLOYMENT_URL';
document.getElementById('capture').onclick = async () => {
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  const [{result}] = await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>({title:document.title,url:location.href,text:(document.body?.innerText||'').slice(0,20000)})});
  const isAI=/chatgpt\.com|claude\.ai/.test(new URL(result.url).hostname);
  const payload={title:result.title,url:result.url,text:result.text,kind:isAI?'ai-context':'captured-tab',perspective:isAI?'context-only':'user-selected',note:document.getElementById('note').value};
  const encoded=btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  chrome.tabs.create({url:`${APP_URL}/?capture=${encodeURIComponent(encoded)}`});
};
