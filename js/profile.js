import { auth, db } from './firebase.js';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import { setupShell, $, message, friendlyError } from './common.js';

setupShell();
const profileStartTimer = setTimeout(() => { const msg = $('#profileMessage'); if (msg && !msg.textContent.trim()) message(msg, 'Still waiting for Firebase. Check the Console for a failed module import or network error.', 'error'); const state = $('#profileAccountState'); if (state && /checking|loading/i.test(state.textContent)) state.textContent = 'Firebase response timed out'; }, 12000);
let currentUser = null;
let currentProfile = {};
let profileLoaded = false;

function show(text, kind = '') {
  message($('#profileMessage'), text, kind);
}

function fillFromAuth(user) {
  $('#profileEmail').value = user.email || '';
  $('#profileUid').value = user.uid || '';
  $('#profileProvider').value = (user.providerData || [])
    .map(item => item.providerId).join(', ') || 'Unknown';
  $('#profileCreatedAt').textContent = user.metadata?.creationTime || 'Not available';
  $('#profileLastSignIn').textContent = user.metadata?.lastSignInTime || 'Not available';
  $('#profileAccountState').textContent = 'Signed in';
  $('#profileName').value = user.displayName || '';
  const chip = $('#accountChip');
  if (chip) chip.textContent = user.displayName || user.email || 'Signed in';
}

async function loadUserProfile(user) {
  currentUser = user;
  currentProfile = {};
  profileLoaded = false;
  fillFromAuth(user); // Do not wait for Firestore to show basic account information.
  show('Signed in. Loading saved profile…');

  try {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      currentProfile = snap.data() || {};
      $('#profileName').value = currentProfile.name || user.displayName || '';
      $('#profileAccountState').textContent = currentProfile.active === false ? 'Disabled' : 'Active';
      const chip = $('#accountChip');
      if (chip) chip.textContent = currentProfile.name || user.displayName || user.email || 'Signed in';
      profileLoaded = true;
      show('Profile loaded.', 'success');
    } else {
      show('Your Firebase sign-in works, but the Firestore profile document is missing. Click Save profile to create it.', 'error');
    }
  } catch (error) {
    console.error('Wi-Fi Hub profile read error:', error);
    show('Firebase account loaded, but Firestore profile read failed: ' + friendlyError(error), 'error');
  }
}

onAuthStateChanged(auth, user => {
  clearTimeout(profileStartTimer);
  if (!user) {
    currentUser = null;
    const chip = $('#accountChip');
    if (chip) chip.textContent = 'Not signed in';
    location.replace('./index.html');
    return;
  }
  loadUserProfile(user).catch(error => {
    console.error('Profile load error:', error);
    show('Profile could not load: ' + friendlyError(error), 'error');
  });
});

$('#profileForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentUser) {
    show('Firebase is still checking your sign-in. Refresh and try again.', 'error');
    return;
  }
  const name = $('#profileName').value.trim();
  if (!name) {
    show('Please enter a display name.', 'error');
    return;
  }
  const button = event.currentTarget.querySelector('[type="submit"]');
  if (button) button.disabled = true;
  try {
    const ref = doc(db, 'users', currentUser.uid);
    const snap = await getDoc(ref);
    const data = {
      name,
      email: currentUser.email || '',
      updatedAt: serverTimestamp()
    };
    if (!snap.exists()) {
      // Required by the current firestore.rules create condition.
      data.role = 'user';
      data.active = true;
      data.createdAt = serverTimestamp();
    }
    await updateProfile(currentUser, { displayName: name });
    await setDoc(ref, data, { merge: true });
    currentProfile = { ...currentProfile, ...data, name };
    profileLoaded = true;
    const chip = $('#accountChip');
    if (chip) chip.textContent = name;
    $('#profileAccountState').textContent = currentProfile.active === false ? 'Disabled' : 'Active';
    show('Profile saved successfully.', 'success');
  } catch (error) {
    console.error('Wi-Fi Hub profile save error:', error);
    show('Could not save profile: ' + friendlyError(error), 'error');
  } finally {
    if (button) button.disabled = false;
  }
});

$('#sendResetEmail')?.addEventListener('click', async () => {
  try {
    if (!currentUser?.email) throw new Error('No email address is attached to this account.');
    await sendPasswordResetEmail(auth, currentUser.email);
    show('Password reset email sent.', 'success');
  } catch (error) {
    show(friendlyError(error), 'error');
  }
});
