import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const saJson = process.env.SERVICE_ACCOUNT_KEY;
if (!saJson) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set");
}

const serviceAccount = JSON.parse(saJson) as ServiceAccount;

export const adminApp =
  getApps()[0] ??
  initializeApp({
    credential: cert(serviceAccount),
  });

export const adminDb = getFirestore(adminApp);