import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

let _bucket = null;

const BUCKET = process.env.FIREBASE_STORAGE_BUCKET;
const SERVICE_KEY = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

if (BUCKET && SERVICE_KEY) {
  try {
    if (getApps().length === 0) {
      initializeApp({
        credential: cert(JSON.parse(SERVICE_KEY)),
        storageBucket: BUCKET,
      });
    }
    _bucket = getStorage().bucket();
    console.log('✓ Firebase Storage connected');
  } catch (err) {
    console.warn('⚠ Firebase Storage init failed:', err.message);
    _bucket = null;
  }
} else {
  console.warn('⚠ Firebase Storage not configured — logos stored locally');
}

export const bucket = _bucket;
export const isFirebaseReady = () => _bucket !== null;
