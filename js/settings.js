import { setupShell, readPreferences, applyPreferences } from './common.js';

setupShell();

const $id = id => document.getElementById(id);
const message = $id('preferencesMessage');

function say(t, kind = '') {
  if (message) {
    message.textContent = t;
    message.classList.remove('success', 'error');
    if (kind) message.classList.add(kind);
  }
}

function prefsFromForm() {
  const old = readPreferences();
  return {
    ...old,
    theme: $id('themeChoice')?.value || 'system',
    accent: $id('accentChoice')?.value || '#4285f4',
    opacity: Number($id('opacityChoice')?.value ?? 82),
    blur: Number($id('blurChoice')?.value ?? 18),
    language: $id('languageChoice')?.value || 'en',
    font: $id('fontChoice')?.value || 'system',
    offlineMode: !!$id('offlineModeChoice')?.checked
  };
}

function fill() {
  const p = readPreferences();
  if ($id('themeChoice')) $id('themeChoice').value = ['light','dark','system','ocean','emerald','amber','sunset'].includes(p.theme) ? p.theme : 'system';
  for (const [id, key] of [['accentChoice','accent'],['opacityChoice','opacity'],['blurChoice','blur'],['languageChoice','language'],['fontChoice','font']]) {
    if ($id(id) && p[key] != null) $id(id).value = p[key];
  }
  if ($id('offlineModeChoice')) $id('offlineModeChoice').checked = !!p.offlineMode;
  syncLabels();
  applyPreferences(p);
}

function syncLabels() {
  if ($id('opacityValue') && $id('opacityChoice')) $id('opacityValue').textContent = $id('opacityChoice').value + '%';
  if ($id('blurValue') && $id('blurChoice')) $id('blurValue').textContent = $id('blurChoice').value + 'px';
}

function preview() {
  const p = prefsFromForm();
  applyPreferences(p);
  syncLabels();
}

function save(e) {
  e?.preventDefault();
  try {
    const p = prefsFromForm();
    localStorage.setItem('wifiHubPreferencesV1', JSON.stringify(p));
    applyPreferences(p);
    say('Appearance saved successfully. Your choice will be used across Wi-Fi Hub on this browser.', 'success');
  } catch (err) {
    console.error(err);
    say('Save failed. Check that this site is allowed to use browser storage.', 'error');
  }
}

fill();
['themeChoice','accentChoice','opacityChoice','blurChoice','languageChoice','fontChoice','offlineModeChoice'].forEach(id => {
  const el = $id(id);
  if (el) { el.addEventListener('input', preview); el.addEventListener('change', preview); }
});
$id('savePreferences')?.addEventListener('click', save);
$id('resetPreferences')?.addEventListener('click', () => {
  try {
    localStorage.removeItem('wifiHubPreferencesV1');
    fill();
    say('Reset to System theme. Click Save appearance to confirm.');
  } catch (e) { say('Could not reset preferences.', 'error'); }
});
$id('replayTutorial')?.addEventListener('click', () => {
  localStorage.removeItem('wifiHubTutorialSeenV1');
  location.href = './home.html';
});

const notificationButton = $id('enableNotifications');
function updateNotificationStatus() {
  const status = $id('notificationStatus');
  if (!status) return;
  if (!('Notification' in window)) {
    status.textContent = 'This browser does not support notifications.';
    if (notificationButton) notificationButton.disabled = true;
    return;
  }
  status.textContent = Notification.permission === 'granted'
    ? 'Browser notifications are enabled.'
    : Notification.permission === 'denied'
      ? 'Notifications are blocked in browser settings.'
      : 'Notifications need your permission.';
}
updateNotificationStatus();

notificationButton?.addEventListener('click', async () => {
  const status = $id('notificationStatus');
  if (!('Notification' in window)) {
    if (status) status.textContent = 'This browser does not support notifications.';
    return;
  }
  try {
    const result = await Notification.requestPermission();
    updateNotificationStatus();
    if (result === 'granted') {
      new Notification('Wi-Fi Hub', { body: 'Browser notifications are enabled on this device.' });
    } else if (status) {
      status.textContent = 'Permission not granted. Enable notifications in your browser site settings.';
    }
  } catch (error) {
    if (status) status.textContent = 'Could not enable notifications: ' + (error.message || error);
  }
});
