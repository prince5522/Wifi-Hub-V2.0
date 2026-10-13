import {db} from './firebase.js';
import {collection,getDocs} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
import {requireUser,setupShell,$,readPreferences} from './common.js';
setupShell();
try {
  const session = await requireUser();
  if (!session) throw new Error('Sign in required.');
  const displayName = session.profile.name || session.user.displayName || (session.user.email || '').split('@')[0] || 'there';
  const heading = $('#welcomeHeading');
  if (heading) heading.textContent = `Welcome back, ${displayName}!`;
  const chip = $('#accountChip'); if (chip) chip.textContent = displayName;
  const justLoggedIn = sessionStorage.getItem('wifiHubJustLoggedIn') === '1';
  if (justLoggedIn) {
    sessionStorage.removeItem('wifiHubJustLoggedIn');
    const notice = document.createElement('div');
    notice.className = 'welcome-toast'; notice.setAttribute('role','status');
    notice.innerHTML = `<strong>Welcome to Wi-Fi Hub, ${escapeText(displayName)}!</strong><span>Your account is signed in. Start by adding a network you are authorised to manage.</span><button type="button" aria-label="Dismiss welcome message">×</button>`;
    document.body.append(notice); notice.querySelector('button').addEventListener('click',()=>notice.remove());
    sessionStorage.setItem('wifiHubShowInstallOffer','1');
  }
  const networks = await getDocs(collection(db,'users',session.user.uid,'networks'));
  const count=$('#networkCount'); if(count) count.textContent=String(networks.size);
  const status=$('#networkStatus'); if(status) status.textContent=networks.empty?'Not configured':'Saved details';
  const deviceCount=$('#deviceCount'); if(deviceCount) deviceCount.textContent='Not available';
  const list=$('#savedNetworks');
  if(list){ list.replaceChildren(); if(networks.empty){ const p=document.createElement('p');p.className='muted';p.textContent='No saved networks yet. Open My Network to add your router details.';list.append(p); } else { networks.forEach(snap=>{const data=snap.data();const row=document.createElement('article');row.className='network-item';const title=document.createElement('strong');title.textContent=data.name||'Unnamed network';const detail=document.createElement('p');detail.className='muted';detail.textContent=`Gateway: ${data.gateway||'Not provided'} · Live status: not connected`;row.append(title,detail);list.append(row);});}}
} catch(e) { console.error(e); const n=$('#networkStatus');if(n)n.textContent='Could not load';const chip=$('#accountChip');if(chip&&e.message)chip.textContent=e.message;const list=$('#savedNetworks');if(list)list.textContent='Could not load saved networks. Check your connection and account permissions.'; }
function escapeText(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
