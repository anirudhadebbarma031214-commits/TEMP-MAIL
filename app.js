(() => {
'use strict';
const API='https://api.mail.tm', $=id=>document.getElementById(id), KEY='temp-mail-account-v1';
const s={address:'',password:'',token:'',messages:[],selected:null,busy:false,timer:null};
function toast(t){const e=$('toast');e.textContent=t;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),2600)}
function status(t,bad=false){$('status').textContent=t;$('connection').textContent=bad?'● Service issue':s.token?'● Connected':'● Connecting';$('connection').style.color=bad?'var(--red)':'var(--green)'}
function busy(v){s.busy=v;$('new').disabled=v;$('refresh').disabled=v||!s.token;$('copy').disabled=!s.address;$('new').textContent=v?'Please wait…':'✦ Generate new address'}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function date(v){if(!v)return '';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleString()}
async function api(path,opts={}){const h={Accept:'application/json',...(opts.headers||{})};if(opts.body)h['Content-Type']='application/json';if(s.token)h.Authorization='Bearer '+s.token;const r=await fetch(API+path,{...opts,headers:h});if(!r.ok){let m='Email provider returned '+r.status;try{const j=await r.json();m=j['hydra:description']||j.message||m}catch{}throw Error(m)}return r.status===204?null:r.json()}
function random(){return Math.random().toString(36).slice(2,10)+Math.random().toString(36).slice(2,6)}
async function makeInbox(){
 if(s.busy)return;busy(true);status('Creating a new disposable inbox…');
 try{
  const dr=await fetch(API+'/domains?page=1',{headers:{Accept:'application/json'}});
  if(!dr.ok)throw Error('Could not load email domains. Please try again shortly.');
  const data=await dr.json(),domains=(data['hydra:member']||[]).filter(d=>d.isActive&&!d.isPrivate);
  if(!domains.length)throw Error('No public email domains are available right now.');
  let success=false,last;
  for(let i=0;i<Math.min(5,domains.length);i++){
   const domain=domains[Math.floor(Math.random()*domains.length)].domain,address='inbox'+random()+'@'+domain,password='Tm-'+random()+'-'+random()+'!9';
   try{
    const cr=await fetch(API+'/accounts',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({address,password})});
    if(!cr.ok){let j={};try{j=await cr.json()}catch{}throw Error(j['hydra:description']||j.message||'Mailbox creation failed ('+cr.status+')')}
    const tr=await fetch(API+'/token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({address,password})});
    if(!tr.ok)throw Error('Mailbox created, but provider sign-in failed. Generate another address.');
    const td=await tr.json();s.address=address;s.password=password;s.token=td.token;s.messages=[];s.selected=null;
    localStorage.setItem(KEY,JSON.stringify({address,password}));
    $('address').textContent=address;renderList();readerEmpty();success=true;break;
   }catch(e){last=e}
  }
  if(!success)throw last||Error('Could not create a mailbox.');
  status('Inbox ready. Waiting for incoming messages.');$('refresh').disabled=false;$('copy').disabled=false;
  await refreshInbox(true);
 }catch(e){status(e.message||'Email provider unavailable.',true);toast(e.message||'Could not create inbox');if(!s.address)$('address').textContent='Could not create inbox'}
 finally{busy(false);$('refresh').disabled=!s.token;$('copy').disabled=!s.address}
}
async function restore(){
 try{
  const raw=localStorage.getItem(KEY);if(!raw)return false;const a=JSON.parse(raw);if(!a.address||!a.password)return false;
  s.address=a.address;s.password=a.password;$('address').textContent=s.address;
  const r=await fetch(API+'/token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({address:s.address,password:s.password})});
  if(!r.ok){localStorage.removeItem(KEY);s.address='';s.password='';return false}
  const t=await r.json();s.token=t.token;$('refresh').disabled=false;$('copy').disabled=false;status('Inbox restored. Checking messages…');await refreshInbox(true);return true;
 }catch(e){status('Could not restore inbox. You can generate a new address.',true);return false}
}
function renderList(){
 $('count').textContent=s.messages.length+' message'+(s.messages.length===1?'':'s');
 const root=$('list');
 if(!s.messages.length){root.innerHTML='<div class="empty">✉<b>Your inbox is empty</b>Keep this page open. New messages will appear automatically.</div>';return}
 root.innerHTML=s.messages.map(m=>'<button class="mail-item '+(s.selected===m.id?'selected':'')+'" data-id="'+esc(m.id)+'"><div class="from">'+esc(m.from&&(m.from.name||m.from.address)||'Unknown sender')+'</div><div class="subject">'+esc(m.subject||'(No subject)')+'</div><div class="date">'+esc(date(m.createdAt))+'</div></button>').join('');
 root.querySelectorAll('[data-id]').forEach(b=>b.addEventListener('click',()=>openMessage(b.dataset.id)));
}
function readerEmpty(){$('reader').innerHTML='<div class="empty">↙<b>Select a message</b>Choose an email from your inbox to read it here.</div>';$('delete').disabled=true}
async function refreshInbox(quiet=false){
 if(!s.token)return;if(!quiet)status('Refreshing inbox…');
 try{const d=await api('/messages?page=1');s.messages=d['hydra:member']||[];renderList();if(s.selected&&!s.messages.some(m=>m.id===s.selected)){s.selected=null;readerEmpty()}status('Last checked '+new Date().toLocaleTimeString())}
 catch(e){status(e.message||'Inbox refresh failed.',true);if(!quiet)toast(e.message||'Refresh failed')}
}
async function openMessage(id){
 s.selected=id;renderList();$('reader').innerHTML='<div class="empty"><b>Loading message…</b></div>';$('delete').disabled=true;
 try{
  const m=await api('/messages/'+encodeURIComponent(id));s.selected=id;
  const from=m.from||{},to=(m.to||[]).map(x=>x.address).join(', ');
  let body=m.text||m.intro||'No plain-text message body is available. HTML email content is not displayed for safety.';
  if(Array.isArray(body))body=body.join('\n\n');
  $('reader').innerHTML='<div class="eyebrow">Received message</div><h3>'+esc(m.subject||'(No subject)')+'</h3><div class="meta"><b>From:</b> '+esc((from.name?from.name+' ':'')+(from.address||'Unknown sender'))+'</div><div class="meta"><b>To:</b> '+esc(to)+'</div><div class="meta"><b>Date:</b> '+esc(date(m.createdAt))+'</div><div class="bodytext">'+esc(body)+'</div>';$('delete').disabled=false;
 }catch(e){$('reader').innerHTML='<div class="empty"><b>Could not open message</b>'+esc(e.message)+'</div>';toast('Could not open message')}
}
async function deleteMessage(){
 if(!s.selected)return;const id=s.selected;$('delete').disabled=true;
 try{await api('/messages/'+encodeURIComponent(id),{method:'DELETE'});s.messages=s.messages.filter(m=>m.id!==id);s.selected=null;renderList();readerEmpty();status('Message deleted.');toast('Message deleted')}
 catch(e){toast(e.message||'Could not delete message');$('delete').disabled=false}
}
$('copy').addEventListener('click',async()=>{if(!s.address)return;try{await navigator.clipboard.writeText(s.address);toast('Email address copied')}catch{const t=document.createElement('textarea');t.value=s.address;document.body.appendChild(t);t.select();try{document.execCommand('copy');toast('Email address copied')}catch{toast('Copy failed — select the address manually')}t.remove()}});
$('new').addEventListener('click',async()=>{if(s.address&&!confirm('Generate a new address? This replaces the saved inbox on this device.'))return;await makeInbox()});
$('refresh').addEventListener('click',()=>refreshInbox());$('delete').addEventListener('click',deleteMessage);
(async()=>{busy(true);try{if(!await restore())await makeInbox()}finally{busy(false);$('refresh').disabled=!s.token;$('copy').disabled=!s.address;clearInterval(s.timer);s.timer=setInterval(()=>refreshInbox(true),20000)}})();
})();