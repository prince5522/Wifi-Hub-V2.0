import { setupShell, requireUser, $, message, friendlyError } from './common.js';
import { db } from './firebase.js';
import {
  collection, addDoc, getDocs, deleteDoc, doc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';

setupShell();
let session = null;

function validIPv4(value) {
  const parts = value.trim().split('.');
  return parts.length === 4 && parts.every(p => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
}

function renderNetworks(items) {
  const host = $('#savedNetworks');
  if (!host) return;
  host.replaceChildren();
  if (!items.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'No saved networks yet.';
    host.append(p);
    return;
  }
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'network-item';
    const info = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = item.name || 'Unnamed network';
    const detail = document.createElement('p');
    detail.className = 'muted';
    detail.textContent = `Gateway: ${item.gateway} · Control: ${item.connectionType === 'not-configured' ? 'Not configured' : 'Integration not verified'}`;
    info.append(name, detail);
    const del = document.createElement('button');
    del.className = 'btn btn-secondary';
    del.type = 'button';
    del.textContent = 'Remove';
    del.addEventListener('click', async () => {
      if (!confirm(`Remove saved network “${item.name}”?`)) return;
      try {
        await deleteDoc(doc(db, 'users', session.user.uid, 'networks', item.id));
        await loadNetworks();
        message($('#networkMessage'), 'Network removed.', 'success');
      } catch (e) {
        message($('#networkMessage'), friendlyError(e), 'error');
      }
    });
    row.append(info, del);
    host.append(row);
  }
}

async function loadNetworks() {
  const host = $('#savedNetworks');
  if (host) host.textContent = 'Loading saved networks…';
  const ref = collection(db, 'users', session.user.uid, 'networks');
  const snap = await getDocs(ref);
  renderNetworks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
}

try {
  session = await requireUser();
  if (session) await loadNetworks();
} catch (e) {
  console.error(e);
  message($('#networkMessage'), friendlyError(e), 'error');
}

$('#networkForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  if (!session) return;
  const name = $('#networkName').value.trim();
  const gateway = $('#gateway').value.trim();
  const mac = $('#macAddress').value.trim();
  const connectionType = $('#connectionType').value;
  const notes = $('#networkNotes').value.trim();

  if (!name || !validIPv4(gateway)) {
    message($('#networkMessage'), 'Enter a network name and a valid IPv4 gateway, for example 192.168.1.1.', 'error');
    return;
  }
  if (mac && !/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(mac)) {
    message($('#networkMessage'), 'MAC address format should look like AA:BB:CC:DD:EE:FF.', 'error');
    return;
  }

  const btn = e.currentTarget.querySelector('[type="submit"]');
  btn.disabled = true;
  message($('#networkMessage'), 'Saving network details…');
  try {
    await addDoc(collection(db, 'users', session.user.uid, 'networks'), {
      name, gateway, mac: mac || '', connectionType, notes,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    e.currentTarget.reset();
    message($('#networkMessage'), 'Network details saved. Live control is not enabled unless a compatible integration is configured.', 'success');
    await loadNetworks();
  } catch (err) {
    message($('#networkMessage'), friendlyError(err), 'error');
  } finally {
    btn.disabled = false;
  }
});
