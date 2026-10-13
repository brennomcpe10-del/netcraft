import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDocFromServer, setLogLevel } from 'firebase/firestore';
import { firebaseConfig } from './firebaseConfig.ts';

// Silences internal gRPC lifecycle messages (such as idle stream disconnects)
try {
  setLogLevel('silent');
} catch {}

if (typeof window !== 'undefined' && window.console) {
  const origError = window.console.error;
  window.console.error = (...args: any[]) => {
    const text = args.map(a => (typeof a === 'string' ? a : (a && a.message) || '')).join(' ');
    if (
      text.includes('Disconnecting idle stream') ||
      text.includes('Timed out waiting for new targets') ||
      text.includes("RPC 'Listen' stream")
    ) {
      // Normal Firestore SDK stream cleanup when listeners are released
      return;
    }
    origError.apply(window.console, args);
  };
}

// Initialize Firebase App
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// CRITICAL: Connect with the provisioned firestoreDatabaseId
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Test connection when needed
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore client is currently offline or unreachable.');
    }
    return false;
  }
}
