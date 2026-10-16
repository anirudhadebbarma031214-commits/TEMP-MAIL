(() => {
'use strict';
const API='https://www.1secmail.com/api/v1/', $=id=>document.getElementById(id), KEY='temp-mail-account-v2';
const s={address:'',login:'',domain:'',messages:[],selected:null,busy:false,timer:null,hidden:new Set()};
function toast(t){const e=$('toast');e.textContent=t;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),2800)}
function status(t,bad=false){$('status').textContent=t;$('connection').textContent=bad?'● Service issue':s.address?'● Connected':'● Connecting';$('connection').style.color=bad?'var(--red)':'var(--green)'}
function busy(v){s.busy=v;$('new').disabled=v;$('refresh').disabled=v||!s.address;$('copy').disabled=!s.address;$('new').textContent=v?'Please wait…':'✦ Generate new address'}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function date(v){if(!v)return '';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString()}
async function api(params){const url=API+'?'+new URLSearchParams(params).toString();const attempts=[url,'https://api.allorigins.win/raw?url='+encodeURIComponent(url)];let lastError;for(const target of attempts){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);try{const r=await fetch(target,{headers:{Accept:'application/json'},signal:controller.signal,cache:'no-store'});if(!r.ok){lastError=Error('Email service returned HTTP '+r.status+'.');continue}try{return await r.json()}catch{lastError=Error('Email service returned an invalid response.')}}catch(e){lastError=e.name==='AbortError'?Error('Email service timed out.'):e}finally{clearTimeout(timer)}}if(lastError&&lastError.message==='Email service timed out.')throw Error('Email service timed out. Please try again later.');throw Error('Email service is unavailable from this browser/network. Try another network or try again later.')}
function parseAddress(address){const i=address.lastIndexOf('@');if(i<1)throw Error('The email provider returned an invalid address.');s.address=address;s.login=address.slice(0,i);s.domain=address.slice(i+1)}
async function makeInbox(){
 if(s.busy)return;busy(true);status('Creating a new disposable inbox…');
 try{
  const result=await api({action:'genRandomMailbox',count:'1'});
  if(!Array.isArray(result)||!result[0])throw Error('The email provider could not generate an address. Try again later.');
  parseAddress(result[0]);s.messages=[];s.selected=null;s.hidden=new Set();
  localStorage.setItem(KEY,JSON.stringify({address:s.address}));
  $('address').textContent=s.address;renderList();readerEmpty();status('Inbox ready. Waiting for incoming messages.');
  $('refresh').disabled=false;$('copy').disabled=false;await refreshInbox(true);
 }catch(e){status(e.message||'Email provider unavailable.',true);toast(e.message||'Could not create inbox');if(!s.address)$('address').textContent='Could not create inbox'}
 finally{busy(false);$('refresh').disabled=!s.address;$('copy').disabled=!s.address}
}
async function restore(){
 try{const raw=localStorage.getItem(KEY);if(!raw)return false;const a=JSON.parse(raw);if(!a.address)return false;parseAddress(a.address);$('address').textContent=s.address;status('Inbox restored. Checking messages…');await refreshInbox(true);return true}
 catch(e){status('Could not restore inbox. Generate a new address.',true);return false}
}
function renderList(){
 const messages=s.messages.filter(m=>!s.hidden.has(String(m.id)));
 $('count').textContent=messages.length+' message'+(messages.length===1?'':'s');
 const root=$('list');
 if(!messages.length){root.innerHTML='<div class="empty">✉<b>Your inbox is empty</b>Keep this page open. New messages will appear automatically.</div>';return}
 root.innerHTML=messages.map(m=>'<button class="mail-item '+(s.selected===String(m.id)?'selected':'')+'" data-id="'+esc(m.id)+'"><div class="from">'+esc(m.from||'Unknown sender')+'</div><div class="subject">'+esc(m.subject||'(No subject)')+'</div><div class="date">'+esc(date(m.date))+'</div></button>').join('');
 root.querySelectorAll('[data-id]').forEach(b=>b.addEventListener('click',()=>openMessage(b.dataset.id)));
}
function readerEmpty(){$('reader').innerHTML='<div class="empty">↙<b>Select a message</b>Choose an email from your inbox to read it here.</div>';$('delete').disabled=true}
async function refreshInbox(quiet=false){
 if(!s.address)return;if(!quiet)status('Refreshing inbox…');
 try{
  const d=await api({action:'getMessages',login:s.login,domain:s.domain});
  if(!Array.isArray(d))throw Error('The email provider returned an unexpected inbox response.');
  s.messages=d.filter(m=>!s.hidden.has(String(m.id)));
  renderList();if(s.selected&&!s.messages.some(m=>String(m.id)===s.selected)){s.selected=null;readerEmpty()}
  status('Last checked '+new Date().toLocaleTimeString());
 }catch(e){status(e.message||'Inbox refresh failed.',true);if(!quiet)toast(e.message||'Refresh failed')}
}
async function openMessage(id){
 s.selected=String(id);renderList();$('reader').innerHTML='<div class="empty"><b>Loading message…</b></div>';$('delete').disabled=true;
 try{
  const m=await api({action:'readMessage',login:s.login,domain:s.domain,id:String(id)});
  if(!m||typeof m!=='object')throw Error('This message may have expired. Refresh your inbox.');
  const body=m.textBody||m.body||m.intro||'No plain-text body is available for this message.';
  $('reader').innerHTML='<div class="eyebrow">Received message</div><h3>'+esc(m.subject||'(No subject)')+'</h3><div class="meta"><b>From:</b> '+esc(m.from||'Unknown sender')+'</div><div class="meta"><b>To:</b> '+esc(m.to||s.address)+'</div><div class="meta"><b>Date:</b> '+esc(date(m.date))+'</div><div class="bodytext">'+esc(body)+'</div>';
  $('delete').disabled=false;
 }catch(e){$('reader').innerHTML='<div class="empty"><b>Could not open message</b>'+esc(e.message)+'</div>';toast('Could not open message')}
}
function deleteMessage(){if(!s.selected)return;s.hidden.add(s.selected);s.messages=s.messages.filter(m=>String(m.id)!==s.selected);s.selected=null;renderList();readerEmpty();status('Message hidden from this page.');toast('Message hidden')}
$('copy').addEventListener('click',async()=>{if(!s.address)return;try{await navigator.clipboard.writeText(s.address);toast('Email address copied')}catch{const t=document.createElement('textarea');t.value=s.address;document.body.appendChild(t);t.select();try{document.execCommand('copy');toast('Email address copied')}catch{toast('Copy failed — select the address manually')}t.remove()}});
$('new').addEventListener('click',async()=>{if(s.address&&!confirm('Generate a new address? This replaces the saved inbox on this device.'))return;await makeInbox()});
$('refresh').addEventListener('click',()=>refreshInbox());$('delete').addEventListener('click',deleteMessage);
(async()=>{busy(true);try{if(!await restore())await makeInbox()}finally{busy(false);$('refresh').disabled=!s.address;$('copy').disabled=!s.address;clearInterval(s.timer);s.timer=setInterval(()=>refreshInbox(true),20000)}})();
})();