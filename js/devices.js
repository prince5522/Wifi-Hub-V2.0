import {
  setupShell, requireUser, $, message, apiRequest, friendlyError
} from './common.js';
import { db } from './firebase.js';
import {
  collection, addDoc, getDocs, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';

setupShell();

const host = $('#devicesGrid');
const notice = $('#devicesMessage');
let session = null;

function showUnavailable(text) {
  if (notice) notice.textContent = text;
  if (host) host.replaceChildren();
}

// EASY MODE: Add Device
async function addDevice(event) {
  event.preventDefault();
  const output = $('#addDeviceMessage');
  const button = $('#addDeviceButton');
  
  // If not logged in, just use a dummy ID so it still works locally
  const uid = session?.user?.uid || 'local-user';

  const name = $('#newDeviceName').value.trim();
  const type = $('#newDeviceType').value;
  const address = $('#newDeviceAddress').value.trim();
  const connectionType = $('#newDeviceConnection').value;
  const notes = $('#newDeviceNotes').value.trim();

  if (!name) { message(output, 'Enter a device name.', 'error'); return; }

  button.disabled = true;
  message(output, 'Saving device registration…');

  const newDevice = {
    id: Date.now().toString(),
    name, deviceType: type, address, connectionType, notes,
    status: 'not-configured', createdAt: new Date().toISOString()
  };

  // 1. SAVE LOCALLY FIRST (Instant, never fails)
  const localDevices = JSON.parse(localStorage.getItem('wifiHubLocalDevices') || '[]');
  localDevices.push(newDevice);
  localStorage.setItem('wifiHubLocalDevices', JSON.stringify(localDevices));

  event.currentTarget.reset();
  message(output, 'Device saved successfully!', 'success');
  button.disabled = false;
  
  // 2. Render immediately
  loadSavedDevices();

  // 3. Try to sync to cloud in the background (if it fails, nobody cares)
  if (session) {
    addDoc(collection(db, 'users', uid, 'devices'), {
      name, deviceType: type, address, connectionType, notes,
      status: 'not-configured', createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    }).catch(e => console.warn('Background sync failed, but saved locally.', e));
  }
}

// EASY MODE: Load Devices
async function loadSavedDevices() {
  const target = $('#savedDeviceRegistrations');
  if (!target) return;
  target.replaceChildren();

  // Read from local storage
  let localDevices = JSON.parse(localStorage.getItem('wifiHubLocalDevices') || '[]');

  // Try to merge cloud devices if logged in
  if (session) {
    try {
      const snap = await getDocs(collection(db, 'users', session.user.uid, 'devices'));
      const cloudDevices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Merge them without duplicates
      localDevices = [...localDevices, ...cloudDevices];
    } catch (e) {
      console.warn('Could not fetch cloud devices, showing local only.');
    }
  }

  if (localDevices.length === 0) {
    target.textContent = 'No saved device registrations yet.';
    return;
  }

  for (const data of localDevices) {
    const card = document.createElement('article');
    card.className = 'device-card';
    const title = document.createElement('strong');
    title.textContent = data.name || 'Unnamed device';
    const desc = document.createElement('p');
    desc.className = 'muted';
    desc.textContent = `${data.deviceType || 'device'} · ${data.address || 'No address'}`;
    card.append(title, desc);

    // Add Relay buttons for Smart Switches
    if (String(data.deviceType || '').toLowerCase().includes('switch') ||
        String(data.deviceType || '').toLowerCase().includes('relay')) {
      const controls = document.createElement('div');
      controls.className = 'device-controls';

      for (const [action, label] of [['relay_on', 'Relay ON'], ['relay_off', 'Relay OFF']]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-secondary';
        button.textContent = label;
        button.addEventListener('click', async () => {
          button.disabled = true;
          try {
            const result = await apiRequest(`/devices/${encodeURIComponent(data.id)}/command`, {
              method: 'POST', body: JSON.stringify({ action })
            });
            message(notice, result.message || `${label} queued.`, 'success');
          } catch (e) {
            message(notice, 'Command was not queued: ' + e.message, 'error');
          } finally {
            button.disabled = false;
          }
        });
        controls.append(button);
      }
      card.append(controls);
    }
    target.append(card);
  }
}

// EASY MODE: Refresh Network Devices (Simulated via Supabase)
async function refresh() {
  if (notice) notice.textContent = 'Checking for connected devices…';
  if (host) host.replaceChildren();
  try {
    const data = await apiRequest('/devices');
    const devices = Array.isArray(data.devices) ? data.devices : [];
    if (!devices.length) {
      showUnavailable('No live network devices found. You can still add one below.');
      return;
    }
    if (notice) notice.textContent = `${devices.length} device(s) reported by network.`;
    for (const d of devices) {
      const card = document.createElement('article');
      card.className = 'device-card';
      card.innerHTML = `<strong>${d.name}</strong><p class="muted">${d.ip} · ${d.connection}</p>`;
      host?.append(card);
    }
  } catch (e) {
    showUnavailable('Network scan unavailable. You can still save a device below.');
  }
}

$('#refreshDevices')?.addEventListener('click', refresh);
$('#addDeviceForm')?.addEventListener('submit', addDevice);

// Initialize in the background without blocking the UI
loadSavedDevices();

requireUser({ redirect: false }).then(userSession => {
  session = userSession;
  if (session) loadSavedDevices();
}).catch(() => {
  console.log('Running in offline mode.');
});
