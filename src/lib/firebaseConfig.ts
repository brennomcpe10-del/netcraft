// Universal Firebase Configuration module
// Compatible with both Browser (Vite) and Node.js (Vercel Serverless / Express) environments
// Eliminates Node.js ERR_IMPORT_ATTRIBUTE_MISSING on .json imports

export interface FirebaseAppletConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
  storageBucket: string;
  messagingSenderId: string;
  measurementId?: string;
  oAuthClientId?: string;
  recaptchaSiteKey?: string;
}

// Canonical credentials from firebase-applet-config.json
const baseConfig: FirebaseAppletConfig = {
  projectId: "gen-lang-client-0203549123",
  appId: "1:766705523210:web:2a89490347d5af8725ddf3",
  apiKey: "AIzaSyAWrB0eXd34wntBM8n5DvYhrW6K3SSM7HI",
  authDomain: "gen-lang-client-0203549123.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-remixnetcraftbrs-3ddacb7e-fc44-482b-a38b-7b62be86d6f4",
  storageBucket: "gen-lang-client-0203549123.firebasestorage.app",
  messagingSenderId: "766705523210",
  measurementId: "",
  oAuthClientId: "766705523210-gdonf4nnvvtsckemdde1ad8f0vag3t1k.apps.googleusercontent.com",
  recaptchaSiteKey: ""
};

// If in Node.js environment, attempt to read any updated values from disk safely via fs
function loadConfig(): FirebaseAppletConfig {
  if (typeof window === 'undefined') {
    try {
      // Dynamic import of fs/path in Node environment only
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('fs');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const path = require('path');
      const possiblePaths = [
        path.resolve(process.cwd(), 'firebase-applet-config.json'),
        path.resolve(__dirname, '../../firebase-applet-config.json'),
        path.resolve('/var/task/firebase-applet-config.json')
      ];

      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          const content = fs.readFileSync(p, 'utf-8');
          const parsed = JSON.parse(content);
          if (parsed && parsed.projectId) {
            return { ...baseConfig, ...parsed };
          }
        }
      }
    } catch {
      // In bundled or edge environments where fs is unavailable, baseConfig is used safely
    }
  }
  return baseConfig;
}

export const firebaseConfig: FirebaseAppletConfig = loadConfig();
export default firebaseConfig;
