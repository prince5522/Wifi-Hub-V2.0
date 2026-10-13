/* Wi-Fi Hub v10: fast navigation, local activity timeline, voice navigation and honest status. */
(() => {
  'use strict';
  const PAGES = [
    ['Home','home.html','⌂','Dashboard and saved networks'],
    ['My Network','network.html','◉','Router profile and diagnostics'],
    ['Templates','templates.html','▤','Router and network templates'],
    ['Devices & Smart Switch','devices.html','▦','Registered devices and secure command queue'],
    ['Bluetooth Tools','bluetooth.html','ᛒ','Compatible Bluetooth devices'],
    ['Activity & Alerts','activity.html','◷','Recent browser-side events'],
    ['Profile','profile.html','♙','Account and sign-in details'],
    ['Users & Access','users.html','♧','Invitations and access requests'],
    ['Settings & Themes','settings.html#appearance','⚙','Colour themes, language and offline preferences'],
    ['Wi-Fi Doctor','ai-tutor.html','✧','Troubleshooting help'],
    ['Help','help.html','?','Guides and known limitations']
  ];
  const KEY='wifiHubActivityV10';
  const safe=(v)=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function readLog(){try{return JSON.parse(localStorage.getItem(KEY)||'[]').slice(0,30)}catch{return []}}
  function log(label,detail=''){const entries=readLog();entries.unshift({label,detail,time:new Date().toLocaleString(),at:Date.now()});try{localStorage.setItem(KEY,JSON.stringify(entries.slice(0,30)))}catch{}}
  function createActivityPage(){
    if(!location.pathname.endsWith('/activity.html'))return;
    const content=document.querySelector('.page-content');if(!content)return;
    const panel=document.createElement('section');panel.className='panel';panel.innerHTML='<div class="section-heading"><div><h2>Recent activity</h2><p class="muted">This timeline is stored on this browser only. It is not a server audit log.</p></div><button class="btn btn-secondary" id="clearV10Activity" type="button">Clear history</button></div><div id="v10ActivityList" class="v10-activity"></div><p class="muted small-note">Device commands and router events are only confirmed when a supported backend/device reports a result. This local timeline does not prove hardware actions occurred.</p>';
    content.prepend(panel);renderActivity();panel.querySelector('#clearV10Activity').addEventListener('click',()=>{if(confirm('Clear this browser’s Wi-Fi Hub activity history?')){localStorage.removeItem(KEY);renderActivity()}});
  }
  function renderActivity(){const list=document.getElementById('v10ActivityList');if(!list)return;const entries=readLog();if(!entries.length){list.innerHTML='<p class="muted">No activity recorded yet. Page visits and browser connectivity changes will appear here.</p>';return;}list.innerHTML=entries.map(e=>'<div class="v10-activity-item"><span class="dot"></span><div><strong>'+safe(e.label)+'</strong><div class="muted">'+safe(e.detail||'')+'</div><small class="muted">'+safe(e.time||'')+'</small></div></div>').join('')}
  function createLauncher(){
    if(document.querySelector('.v10-launcher'))return;
    const wrap=document.createElement('div');wrap.className='v10-launcher';wrap.innerHTML='<button type="button" id="v10SearchButton" aria-label="Open quick navigation">⌕ Navigate</button><button type="button" class="voice" id="v10VoiceButton" aria-label="Voice navigation">🎙 Voice</button>';
    const overlay=document.createElement('div');overlay.className='v10-overlay';overlay.hidden=true;overlay.innerHTML='<section class="v10-command-box" role="dialog" aria-modal="true" aria-label="Quick navigation"><strong>Go anywhere in Wi-Fi Hub</strong><p class="muted">Search a page or use Ctrl + K. Voice commands navigate only; they never switch relays or change router settings.</p><input id="v10CommandSearch" type="search" placeholder="Search pages…" autocomplete="off"><div class="v10-command-links" id="v10CommandLinks"></div><p class="muted">Tip: press Escape to close.</p></section>';
    const status=document.createElement('div');status.className='v10-voice-status';status.hidden=true;status.setAttribute('role','status');document.body.append(wrap,overlay,status);
    const input=overlay.querySelector('#v10CommandSearch'),links=overlay.querySelector('#v10CommandLinks');
    function draw(query=''){const q=query.toLowerCase().trim();const items=PAGES.filter(p=>!q||(p[0]+' '+p[3]).toLowerCase().includes(q));links.innerHTML=items.map(p=>'<a href="./'+p[1]+'"><span aria-hidden="true">'+p[2]+'</span> <strong>'+safe(p[0])+'</strong><br><small>'+safe(p[3])+'</small></a>').join('')||'<p class="muted">No matching page. Try “devices”, “themes” or “help”.</p>';}
    const open=()=>{overlay.hidden=false;draw(input.value);input.focus()};const close=()=>{overlay.hidden=true};
    wrap.querySelector('#v10SearchButton').addEventListener('click',open);overlay.addEventListener('click',e=>{if(e.target===overlay)close()});input.addEventListener('input',()=>draw(input.value));document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();open()}if(e.key==='Escape')close()});
    links.addEventListener('click',e=>{const a=e.target.closest('a');if(a)log('Navigation selected',a.textContent.trim())});
    const voice=wrap.querySelector('#v10VoiceButton');voice.addEventListener('click',()=>{
      const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
      if(!SpeechRecognition){status.hidden=false;status.textContent='Voice recognition is not supported in this browser. Use Navigate instead. Voice works only in compatible browsers and usually requires internet.';return;}
      const recognition=new SpeechRecognition();recognition.lang=(JSON.parse(localStorage.getItem('wifiHubPreferencesV1')||'{}').language==='sw')?'sw-KE':'en-KE';recognition.interimResults=false;recognition.maxAlternatives=1;
      status.hidden=false;status.textContent='Listening… Say a page name, for example “open devices” or “open themes”.';voice.disabled=true;
      recognition.onresult=event=>{const said=event.results[0][0].transcript.toLowerCase();status.textContent='Heard: “'+said+'”';const target=PAGES.find(p=>(said.includes(p[0].toLowerCase())||p[0].toLowerCase().split(/\s|&/).some(w=>w.length>3&&said.includes(w))));if(target){log('Voice navigation',target[0]);status.textContent='Opening '+target[0]+'…';location.href='./'+target[1]}else{status.textContent='I could not match that to a page. Try “open devices”, “open network” or “open themes”.';}};
      recognition.onerror=event=>{status.textContent='Voice recognition unavailable: '+event.error+'. Use Navigate or check microphone permissions.'};recognition.onend=()=>{voice.disabled=false};try{recognition.start()}catch(e){voice.disabled=false;status.textContent='Could not start microphone. Check browser permissions.'}
    });
  }
  function addHomeActivity(){if(!location.pathname.endsWith('/home.html'))return;const content=document.querySelector('.page-content');if(!content||document.getElementById('v10HomeActivity'))return;const section=document.createElement('section');section.className='panel';section.id='v10HomeActivity';section.innerHTML='<div class="section-heading"><div><h2>Quick activity</h2><p class="muted">Recent actions recorded on this device</p></div><a class="btn btn-secondary" href="./activity.html">View all</a></div><div class="v10-activity" id="v10HomeActivityList"></div>';const footer=content.querySelector('.app-footer');content.insertBefore(section,footer||null);const list=section.querySelector('#v10HomeActivityList');const items=readLog().slice(0,4);list.innerHTML=items.length?items.map(e=>'<div class="v10-activity-item"><span class="dot"></span><div><strong>'+safe(e.label)+'</strong><div class="muted">'+safe(e.detail||'')+' · '+safe(e.time||'')+'</div></div></div>').join(''):'<p class="muted">Your recent navigation and connection events will appear here.</p>';}
  log('Page opened',location.pathname.split('/').pop()||'home');
  window.addEventListener('offline',()=>log('Connection lost','Browser reports offline; cloud actions may fail.'));
  window.addEventListener('online',()=>log('Connection restored','Browser reports online; cloud sync can be retried.'));
  document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(a&&a.href.startsWith(location.origin)&&!a.href.includes('#'))log('Opened page',a.textContent.trim().slice(0,80)||a.pathname.split('/').pop())});
  createLauncher();createActivityPage();addHomeActivity();
})();
