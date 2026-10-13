// Wi-Fi Hub Firebase setup. Replace the values below with your Web app config
// from Firebase Console > Project settings > Your apps. Never paste service-account keys here.
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyD4CUQJ0pYrTWl8SsHCyrOrTGaHy_PgZYU',
  authDomain: 'wifi-hub-b49e9.firebaseapp.com',
  projectId: 'wifi-hub-b49e9',
  storageBucket: 'wifi-hub-b49e9.firebasestorage.app',
  messagingSenderId: '589971405190',
  appId: '1:589971405190:web:3e616e93341883964ad407'
};
if (Object.values(firebaseConfig).some(v => String(v).startsWith('PASTE_'))) {
  console.warn('Wi-Fi Hub: paste the real Firebase Web app config into js/firebase.js.');
}
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
