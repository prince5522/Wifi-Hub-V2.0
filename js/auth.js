// Wi-Fi Hub authentication. This file intentionally loads Firebase dynamically
// so a failed Firebase/network import can be shown on the page instead of
// leaving the Sign in button apparently dead.
const $ = (selector) => document.querySelector(selector);
const loginForm = $('#loginForm');
const registerForm = $('#registerForm');
const showRegister = $('#showRegister');
const cancelRegister = $('#cancelRegister');
const googleButton = $('#googleSignIn');
const authMessage = $('#authMessage');
const registerMessage = $('#registerMessage');

function showMessage(el, text, kind = '') {
  if (!el) return;
  el.textContent = text;
  el.classList.remove('success', 'error');
  if (kind) el.classList.add(kind);
}

function explainError(error) {
  const code = error?.code || '';
  const messages = {
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/user-not-found': 'No account was found for that email.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/user-disabled': 'This account has been disabled. Contact the app administrator.',
    'auth/too-many-requests': 'Too many attempts. Wait a little, then try again.',
    'auth/network-request-failed': 'Network error. Check your internet connection.',
    'auth/operation-not-allowed': 'Email/password sign-in is not enabled in Firebase Console.',
    'auth/unauthorized-domain': 'This website domain is not authorised in Firebase Authentication.',
    'auth/email-already-in-use': 'That email already has an account. Please sign in.',
    'auth/weak-password': 'Choose a stronger password (at least 6 characters).',
    'auth/popup-closed-by-user': 'Google sign-in was closed before it finished.',
    'auth/popup-blocked': 'The browser blocked the Google sign-in window.',
    'permission-denied': 'Firestore denied access. Check the Firestore security rules.'
  };
  return messages[code] || error?.message || 'Something went wrong. Please try again.';
}

let firebasePromise;
function loadFirebase() {
  if (!firebasePromise) {
    firebasePromise = Promise.all([
      import('./firebase.js'),
      import('https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js')
    ]).then(([core, authSdk, firestore]) => ({
      auth: core.auth,
      db: core.db,
      ...authSdk,
      ...firestore
    }));
  }
  return firebasePromise;
}

// Show a clear message if Firebase cannot even load. This was silent with
// static imports, which can make the button appear to do nothing.
loadFirebase().catch(error => {
  console.error('Wi-Fi Hub Firebase startup failed:', error);
  showMessage(authMessage, `Login could not start: ${explainError(error)}. Check that js/firebase.js exists and this site is opened over HTTPS.`, 'error');
});

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector('[type="submit"]');
  const email = ($('#email')?.value || '').trim().toLowerCase();
  const password = $('#password')?.value || '';

  if (!email || !password) {
    showMessage(authMessage, 'Enter both your email address and password.', 'error');
    return;
  }
  if (button) { button.disabled = true; button.textContent = 'Signing in…'; }
  showMessage(authMessage, 'Connecting securely to Firebase…');

  try {
    const { auth, signInWithEmailAndPassword } = await loadFirebase();
    await signInWithEmailAndPassword(auth, email, password);
    sessionStorage.setItem('wifiHubJustLoggedIn', '1');
    showMessage(authMessage, 'Login successful. Opening Wi-Fi Hub…', 'success');
    location.replace('./home.html');
  } catch (error) {
    console.error('Wi-Fi Hub email login failed:', error);
    showMessage(authMessage, explainError(error), 'error');
  } finally {
    if (button) { button.disabled = false; button.textContent = 'Sign in'; }
  }
});

googleButton?.addEventListener('click', async () => {
  googleButton.disabled = true;
  showMessage(authMessage, 'Opening Google sign-in…');
  try {
    const { auth, db, GoogleAuthProvider, signInWithPopup, doc, setDoc, serverTimestamp } = await loadFirebase();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    // Create the profile only if absent, so a disabled profile is not silently reactivated.
    const { getDoc } = await loadFirebase();
    const profileRef = doc(db, 'users', user.uid);
    const profile = await getDoc(profileRef);
    if (!profile.exists()) {
      await setDoc(profileRef, { name: user.displayName || 'Wi-Fi Hub user', email: user.email || '', role: 'user', active: true, createdAt: serverTimestamp() });
    }
    sessionStorage.setItem('wifiHubJustLoggedIn', '1');
    location.replace('./home.html');
  } catch (error) {
    console.error('Wi-Fi Hub Google login failed:', error);
    showMessage(authMessage, explainError(error), 'error');
  } finally {
    googleButton.disabled = false;
  }
});

showRegister?.addEventListener('click', () => {
  if (loginForm) loginForm.hidden = true;
  if (registerForm) registerForm.hidden = false;
  showRegister.hidden = true;
  showMessage(authMessage, '');
  $('#registerName')?.focus();
});

cancelRegister?.addEventListener('click', () => {
  if (registerForm) registerForm.hidden = true;
  if (loginForm) loginForm.hidden = false;
  if (showRegister) showRegister.hidden = false;
  showMessage(registerMessage, '');
});

registerForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = registerForm.querySelector('[type="submit"]');
  const name = ($('#registerName')?.value || '').trim();
  const email = ($('#registerEmail')?.value || '').trim().toLowerCase();
  const password = $('#registerPassword')?.value || '';
  const confirm = $('#registerPasswordConfirm')?.value || '';
  if (!name) return showMessage(registerMessage, 'Please enter your name.', 'error');
  if (password.length < 6) return showMessage(registerMessage, 'Use a password with at least 6 characters.', 'error');
  if (password !== confirm) return showMessage(registerMessage, 'The passwords do not match.', 'error');
  if (button) { button.disabled = true; button.textContent = 'Creating account…'; }
  showMessage(registerMessage, 'Creating your secure account…');
  try {
    const { auth, db, createUserWithEmailAndPassword, updateProfile, doc, setDoc, serverTimestamp } = await loadFirebase();
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName: name });
    await setDoc(doc(db, 'users', credential.user.uid), { name, email, role: 'user', active: true, createdAt: serverTimestamp() });
    sessionStorage.setItem('wifiHubJustLoggedIn', '1');
    location.replace('./home.html');
  } catch (error) {
    console.error('Wi-Fi Hub account creation failed:', error);
    showMessage(registerMessage, explainError(error), 'error');
  } finally {
    if (button) { button.disabled = false; button.textContent = 'Create account'; }
  }
});

$('#forgotPassword')?.addEventListener('click', async () => {
  const email = ($('#email')?.value || '').trim().toLowerCase();
  if (!email) {
    showMessage(authMessage, 'Enter your email address first, then select Forgot password.', 'error');
    $('#email')?.focus();
    return;
  }
  try {
    const { auth, sendPasswordResetEmail } = await loadFirebase();
    await sendPasswordResetEmail(auth, email);
    showMessage(authMessage, 'Password reset email sent. Check your inbox and spam folder.', 'success');
  } catch (error) {
    console.error('Wi-Fi Hub password reset failed:', error);
    showMessage(authMessage, explainError(error), 'error');
  }
});
