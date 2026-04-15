import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { normalizeLocale, resolveClientBrowserLocale, type Locale } from '@/lib/i18n/locales'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Verifica se as variáveis de ambiente estão configuradas
const hasValidConfig = Boolean(firebaseConfig.apiKey);

if (!hasValidConfig && typeof window !== 'undefined') {
  console.warn('[Firebase] Configuração ausente ou incompleta. Verifique seu arquivo .env.local');
  console.log('[Firebase] Chaves detectadas:', {
    apiKey: !!firebaseConfig.apiKey,
    authDomain: !!firebaseConfig.authDomain,
    projectId: !!firebaseConfig.projectId
  });
}

// Inicializa o Firebase apenas se houver configuração válida e não houver apps inicializados
const app = hasValidConfig && getApps().length === 0 
  ? initializeApp(firebaseConfig) 
  : getApps().length > 0 
    ? getApp() 
    : null;

const db = app ? getFirestore(app) : null;

// Só inicializa o auth se tivermos um app válido e estivermos no cliente
const auth = app && typeof window !== 'undefined' ? getAuth(app) : null;
const storage = app && typeof window !== 'undefined' ? getStorage(app) : null;

if (auth) {
  const locale = resolveClientBrowserLocale()
  auth.languageCode = locale === 'en' ? 'en' : 'pt-BR'
} else if (typeof window !== 'undefined') {
  console.log('[Firebase] Auth não inicializado (app:', !!app, ', window:', typeof window !== 'undefined', ')');
}

// Utilitários para papéis (roles)
export async function getUserRole(uid: string): Promise<'admin' | 'user'> {
  if (!db) return 'user';
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      return userDoc.data().role || 'user';
    }
    return 'user';
  } catch (error) {
    console.error('Erro ao buscar role do usuário:', error);
    return 'user';
  }
}

export async function createUserProfile(
  uid: string,
  email: string,
  role: 'admin' | 'user' = 'user',
  whatsapp: string = '',
  locale?: Locale
): Promise<boolean> {
  if (!db) return false;
  try {
    const userRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userRef);
    
    // Só cria se não existir (evita sobrescrever admins)
    if (!userDoc.exists()) {
      await setDoc(userRef, {
        email,
        role,
        accountType: 'main',
        ownerUid: uid,
        subaccountPermissions: {
          quickRepliesCrud: false
        },
        locale: normalizeLocale(locale ?? resolveClientBrowserLocale()),
        whatsapp,
        telefone: whatsapp,
        createdAt: new Date().toISOString(),
      });

      const trainingRef = doc(db, 'users', uid, 'settings', 'ai_training');
      await setDoc(
        trainingRef,
        { model: 'google', updatedAt: new Date().toISOString() },
        { merge: true }
      );
      return true;
    }
    return false;
  } catch (error) {
    console.error('Erro ao criar perfil do usuário:', error);
    return false;
  }
}

// Interface do perfil do usuário
export interface UserProfile {
  nome?: string;
  email?: string;
  telefone?: string;
  empresa?: string;
  endereco?: string;
  locale?: Locale;
  timezone?: string;
  whatsapp?: string;
  role?: 'admin' | 'user';
  accountType?: 'main' | 'subaccount';
  ownerUid?: string;
  subaccountPermissions?: {
    quickRepliesCrud?: boolean;
  };
  createdAt?: string;
  updatedAt?: string;
}

// Buscar perfil do usuário
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (!db) return null;
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      return userDoc.data() as UserProfile;
    }
    return null;
  } catch (error) {
    console.error('Erro ao buscar perfil do usuário:', error);
    return null;
  }
}

// Atualizar perfil do usuário
export async function updateUserProfile(uid: string, data: Partial<UserProfile>): Promise<boolean> {
  if (!db) return false;
  try {
    const userRef = doc(db, 'users', uid);
    await setDoc(
      userRef,
      {
        ...data,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    return true;
  } catch (error) {
    console.error('Erro ao atualizar perfil do usuário:', error);
    return false;
  }
}

export { db, auth, storage };

