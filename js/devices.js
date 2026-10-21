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

function explainDeviceError(error) {
  const code = error?.code || '';
  if (code === 'permission-denied' || code === 'firestore/permission-denied') {
    return 'Device was not saved because Firestore Rules denied access. Check that users/{uid}/devices permits the signed-in owner to create records.';
  }
  if (code === 'unavailable' || code === 'auth/network-request-failed') {
    return 'Network unavailable. Reconnect and retry. Your device was not saved.';
  }
  if (code === 'unauthenticated') return 'Your session expired. Sign in again, then retry.';
  return friendlyError(error) + ' If it continues, check the browser Console and Firestore Rules.';
}

function showUnavailable(text) {
  if (notice) notice.textContent = text;
  if (host) host.replaceChildren();
}

async function refresh() {
  if (notice) notice.textContent = 'Checking for a configured device source…';
  if (host) host.replaceChildren();
  try {
    await requireUser();
    const data = await apiRequest('/devices');
    const devices = Array.isArray(data.devices) ? data.devices : [];
    if (!devices.length) {
      showUnavailable(data.message || 'No compatible router has reported connected-device data. Saved device registrations are listed below.');
      return;
    }
    if (notice) notice.textContent = `${devices.length} device(s) reported by the configured integration.`;
    for (const d of devices) {
      const card = document.createElement('article');
      card.className = 'device-card';
      const name = document.createElement('strong');
      name.textContent = d.name || d.hostname || 'Unnamed device';
      const info = document.createElement('p');
      info.className = 'muted';
      info.textContent = [d.ip, d.mac, d.connection].filter(Boolean).join(' · ') || 'Details not supplied';
      card.append(name, info);
      host?.append(card);
    }
  } catch (e) {
    console.warn('Live device discovery unavailable:', e);
    showUnavailable(e.message.includes('backend URL')
      ? 'Device discovery needs the secure Python backend URL and a compatible router integration. You can still save a device registration below.'
      : e.message + ' You can still save a device registration below.');
  }
}

async function addDevice(event) {
  event.preventDefault();
  const output = $('#addDeviceMessage');
  const button = $('#addDeviceButton');
  if (!session) {
    message(output, 'Waiting for sign-in. Refresh the page after signing in.', 'error');
    return;
  }
  const name = $('#newDeviceName').value.trim();
  const type = $('#newDeviceType').value;
  const address = $('#newDeviceAddress').value.trim();
  const connectionType = $('#newDeviceConnection').value;
  const notes = $('#newDeviceNotes').value.trim();

  if (!name) { message(output, 'Enter a device name.', 'error'); return; }
  if (address && /^https?:\/\//i.test(address)) {
    message(output, 'Enter an IP address or device ID, not a website URL.', 'error');
    return;
  }

  button.disabled = true;
  message(output, 'Saving device registration…');
  try {
    await addDoc(collection(db, 'users', session.user.uid, 'devices'), {
      name, deviceType: type, address, connectionType, notes,
      status: 'not-configured', createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    event.currentTarget.reset();
    message(output, 'Device saved. To control it, configure a supported Bluetooth protocol or secure backend; registration alone does not send commands.', 'success');
    await loadSavedDevices();
  } catch (error) {
    console.error('Add device failed:', error);
    message(output, explainDeviceError(error), 'error');
  } finally {
    button.disabled = false;
  }
}

async function loadSavedDevices() {
  const target = $('#savedDeviceRegistrations');
  if (!target || !session) return;
  target.replaceChildren();
  try {
    const snap = await getDocs(collection(db, 'users', session.user.uid, 'devices'));
    if (snap.empty) { target.textContent = 'No saved device registrations yet.'; return; }
    for (const d of snap.docs) {
      const data = d.data();
      const card = document.createElement('article');
      card.className = 'device-card';
      const title = document.createElement('strong');
      title.textContent = data.name || 'Unnamed device';
      const desc = document.createElement('p');
      desc.className = 'muted';
      desc.textContent = `${data.deviceType || 'device'} · ${data.address || 'No address'} · ${data.status || 'not-configured'}`;
      card.append(title, desc);

      if (String(data.deviceType || '').toLowerCase().includes('switch') ||
          String(data.deviceType || '').toLowerCase().includes('esp')) {
        const controls = document.createElement('div');
        controls.className = 'device-controls';

        const provision = document.createElement('button');
        provision.type = 'button';
        provision.className = 'btn btn-secondary';
        provision.textContent = 'Provision device';
        provision.addEventListener('click', async () => {
          provision.disabled = true;
          provision.textContent = 'Provisioning…';
          try {
            const result = await apiRequest(`/devices/${encodeURIComponent(d.id)}/provision`, {
              method: 'POST', body: JSON.stringify({})
            });
            window.prompt('Copy this device token now and place it in the device firmware. It will not be shown again.', result.deviceToken);
            message(notice, 'Device credential created. The device still needs secure firmware that polls the backend and executes only supported commands.', 'success');
          } catch (e) {
            message(notice, 'Could not provision device: ' + e.message, 'error');
          } finally {
            provision.disabled = false;
            provision.textContent = 'Provision device';
          }
        });

        for (const [action, label] of [['relay_on', 'Relay ON'], ['relay_off', 'Relay OFF']]) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'btn btn-secondary';
          button.textContent = label;
          button.addEventListener('click', async () => {
            if (!confirm(`Queue ${label} for ${data.name || 'this device'}? The device must be online with compatible firmware.`)) return;
            button.disabled = true;
            try {
              const result = await apiRequest(`/devices/${encodeURIComponent(d.id)}/command`, {
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
        controls.append(provision);
        card.append(controls);
      }
      target.append(card);
    }
  } catch (e) {
    target.textContent = 'Could not load saved devices: ' + explainDeviceError(e);
  }
}

$('#refreshDevices')?.addEventListener('click', refresh);
$('#addDeviceForm')?.addEventListener('submit', addDevice);

try {
  session = await requireUser();
  if (session) await Promise.allSettled([refresh(), loadSavedDevices()]);
} catch (e) {
  console.error(e);
  showUnavailable('Could not verify the signed-in user. ' + explainDeviceError(e));
}
