(() => {
  if (document.getElementById('research-ledger-capture')) return;
  const btn=document.createElement('button');
  btn.id='research-ledger-capture';
  btn.textContent='Save to Research Ledger';
  Object.assign(btn.style,{position:'fixed',right:'18px',bottom:'18px',zIndex:2147483647,padding:'9px 12px',borderRadius:'999px',border:'1px solid #bfc8c2',background:'#f7f5ef',color:'#183d2f',font:'12px system-ui',boxShadow:'0 4px 16px rgba(0,0,0,.12)',cursor:'pointer'});
  btn.onclick=()=>chrome.runtime.sendMessage({type:'open-side-panel'});
  document.body.appendChild(btn);
})();
