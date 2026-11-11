import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDocFromServer, setLogLevel, connectFirestoreEmulator } from 'firebase/firestore';
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

// Local tests are isolated from the real project, even if a test accidentally omits a collection fixture.
const emulatorHost = typeof window === 'undefined'
  ? (process.env.NODE_ENV !== 'production' ? process.env.FIRESTORE_EMULATOR_HOST : undefined)
  : (import.meta.env?.DEV ? import.meta.env.VITE_FIRESTORE_EMULATOR_HOST : undefined);
if (emulatorHost && !/^127\.0\.0\.1:\d+$/.test(emulatorHost)) throw new Error('Use apenas o emulador local em 127.0.0.1.');
const app = getApps().length > 0 ? getApp() : initializeApp(emulatorHost
  ? {...firebaseConfig, projectId:'demo-netcraft-admin-test', firestoreDatabaseId:'(default)'}
  : firebaseConfig);
export const db = getFirestore(app, emulatorHost ? '(default)' : firebaseConfig.firestoreDatabaseId);
if (emulatorHost) {
  const [host, port] = emulatorHost.split(':');
  connectFirestoreEmulator(db, host, Number(port));
}

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
