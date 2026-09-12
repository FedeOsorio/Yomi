import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { makeRedirectUri, AuthRequest, ResponseType, exchangeCodeAsync, refreshAsync } from 'expo-auth-session';
import { Platform } from 'react-native';
import { getStorageItem, setStorageItem, removeStorageItem } from './storage-service';
import { YomiFullBackupPackage, createFullBackupPackage } from './backup-service';

WebBrowser.maybeCompleteAuthSession();

export const GOOGLE_DRIVE_BACKUP_FILENAME = 'yomi-backup.json';

const STORAGE_KEY_USER = 'yomi_google_user_profile';
const STORAGE_KEY_TOKEN = 'yomi_google_access_token';
const STORAGE_KEY_REFRESH_TOKEN = 'yomi_google_refresh_token';
const STORAGE_KEY_DRIVE_BACKUP = 'yomi_google_drive_last_backup';

export interface GoogleUserProfile {
  email: string;
  name: string;
  picture?: string;
}

export interface GoogleDriveBackupMetadata {
  fileId: string;
  name: string;
  modifiedTime: string;
  sizeBytes?: number;
  decksCount?: number;
  wordsCount?: number;
  srsCount?: number;
}

export const GOOGLE_DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

/**
 * Inicia sesión con Google de forma 100% directa y asíncrona.
 * Crea una nueva solicitud con un nuevo verificador PKCE cada vez,
 * evitando cualquier bloqueo por reutilización de sesiones previas.
 */
export async function loginWithGoogleAsync(): Promise<{
  profile: GoogleUserProfile;
  token: string;
  metadata: GoogleDriveBackupMetadata | null;
}> {
  const clientId = Platform.OS === 'android'
    ? process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
    : Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
    : process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

  if (!clientId) {
    throw new Error('No se encontró el Client ID de Google configurado en el archivo .env.');
  }

  const redirectUri = Platform.OS === 'android' || Platform.OS === 'ios'
    ? 'com.kuyi.yomi:/oauthredirect'
    : makeRedirectUri();

  console.log('[GoogleAuth] Starting loginWithGoogleAsync with clientId:', clientId);

  // Crear una instancia limpia de AuthRequest con PKCE único
  const authRequest = new AuthRequest({
    clientId,
    scopes: GOOGLE_DRIVE_SCOPES,
    redirectUri,
    responseType: ResponseType.Code,
    usePKCE: true,
    extraParams: {
      prompt: 'consent select_account',
      access_type: 'offline',
    },
  });

  const result = await authRequest.promptAsync(Google.discovery);
  console.log('[GoogleAuth] promptAsync returned:', result.type);

  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new Error('USER_CANCELLED');
  }

  if (result.type !== 'success') {
    const errorMsg = (result as any).error?.message || (result as any).params?.error_description || 'El inicio de sesión no se completó.';
    console.error('[GoogleAuth] Auth failed:', errorMsg);
    throw new Error(errorMsg);
  }

  const code = result.params?.code;
  if (!code) {
    throw new Error('Google no devolvió el código de autorización.');
  }

  console.log('[GoogleAuth] Exchanging code for token...');
  const exchangeResult = await exchangeCodeAsync(
    {
      clientId,
      code,
      redirectUri,
      extraParams: {
        code_verifier: authRequest.codeVerifier || '',
      },
    },
    Google.discovery
  );

  const accessToken = exchangeResult.accessToken;
  if (!accessToken) {
    throw new Error('No se pudo obtener el token de acceso de Google.');
  }

  if (exchangeResult.refreshToken) {
    console.log('[GoogleAuth] Refresh token received and saved');
    await setStorageItem(STORAGE_KEY_REFRESH_TOKEN, exchangeResult.refreshToken);
  }

  console.log('[GoogleAuth] Token obtained, fetching user info...');
  const profile = await fetchGoogleUserInfo(accessToken);
  console.log('[GoogleAuth] User profile retrieved:', profile.email);

  let metadata: GoogleDriveBackupMetadata | null = null;
  try {
    metadata = await findDriveBackupFile(accessToken);
  } catch {}

  return {
    profile,
    token: accessToken,
    metadata,
  };
}

/**
 * Hook para manejar el flujo de autenticación con Google OAuth 2.0.
 */
export function useGoogleDriveAuth() {
  const webId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined;
  const androidId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || undefined;
  const iosId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || undefined;

  const redirectUri = Platform.OS === 'android'
    ? 'com.kuyi.yomi:/oauthredirect'
    : Platform.OS === 'ios'
    ? 'com.kuyi.yomi:/oauthredirect'
    : makeRedirectUri();

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: webId,
    webClientId: webId,
    androidClientId: androidId,
    iosClientId: iosId,
    scopes: GOOGLE_DRIVE_SCOPES,
    redirectUri,
    selectAccount: true,
    extraParams: {
      prompt: 'consent select_account',
      access_type: 'offline',
    },
  });

  return {
    request,
    response,
    promptAsync,
  };
}

/**
 * Verifica si el token tiene concedido el scope de Google Drive.
 */
export async function checkTokenDriveScope(accessToken: string): Promise<{
  valid: boolean;
  hasDriveScope: boolean;
  scope?: string;
  error?: string;
}> {
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${accessToken}`);
    if (!res.ok) {
      return { valid: false, hasDriveScope: false, error: 'Token no verificado por Google' };
    }
    const data = await res.json();
    const scopes = typeof data.scope === 'string' ? data.scope.split(' ') : [];
    const hasDriveScope = scopes.some((s: string) => s.includes('drive.appdata') || s.includes('drive'));
    return {
      valid: true,
      hasDriveScope,
      scope: data.scope,
    };
  } catch (err: any) {
    return { valid: false, hasDriveScope: false, error: err.message };
  }
}

/**
 * Consulta la información del usuario a partir del accessToken de Google.
 */
export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserProfile> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error('No se pudo verificar la cuenta de Google.');
  }

  const data = await res.json();
  const profile: GoogleUserProfile = {
    email: data.email,
    name: data.name || data.email,
    picture: data.picture,
  };

  await setStorageItem(STORAGE_KEY_USER, JSON.stringify(profile));
  await setStorageItem(STORAGE_KEY_TOKEN, accessToken);
  notifyGoogleUserChanged(profile);

  return profile;
}

type AuthListener = (user: GoogleUserProfile | null) => void;
const listeners = new Set<AuthListener>();

export function onGoogleUserChange(callback: AuthListener) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

export function notifyGoogleUserChanged(user: GoogleUserProfile | null) {
  listeners.forEach((cb) => {
    try {
      cb(user);
    } catch (e) {
      console.warn('Error in auth listener:', e);
    }
  });
}

/**
 * Obtiene el perfil del usuario de Google guardado localmente.
 */
export async function getStoredGoogleUser(): Promise<GoogleUserProfile | null> {
  const str = await getStorageItem(STORAGE_KEY_USER);
  if (!str) return null;
  try {
    return JSON.parse(str) as GoogleUserProfile;
  } catch {
    return null;
  }
}

/**
 * Obtiene el token de acceso actual de Google almacenado.
 */
export async function getStoredGoogleToken(): Promise<string | null> {
  return await getStorageItem(STORAGE_KEY_TOKEN);
}

let activeRefreshPromise: Promise<string> | null = null;
let activeFindDrivePromise: Promise<GoogleDriveBackupMetadata | null> | null = null;
let lastDriveQueryTime = 0;
const DRIVE_QUERY_CACHE_MS = 60 * 1000;

/**
 * Renueva el token de acceso de Google de forma silenciosa usando el refresh token.
 * Posee un candado (singleton promise) para evitar múltiples renovaciones en paralelo.
 */
export async function refreshGoogleAccessToken(): Promise<string> {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    try {
      const refreshToken = await getStorageItem(STORAGE_KEY_REFRESH_TOKEN);
      if (!refreshToken) {
        // Si no hay refresh token, el token actual ya no sirve
        await removeStorageItem(STORAGE_KEY_TOKEN);
        throw new Error('No hay sesión de Google activa para renovar.');
      }

      const clientId = Platform.OS === 'android'
        ? process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
        : Platform.OS === 'ios'
        ? process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
        : process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

      // 1. Intentar renovar con refreshAsync de expo-auth-session
      try {
        const tokenResult = await refreshAsync(
          {
            clientId: clientId || '',
            refreshToken,
          },
          Google.discovery
        );

        if (tokenResult.accessToken) {
          await setStorageItem(STORAGE_KEY_TOKEN, tokenResult.accessToken);
          if (tokenResult.refreshToken) {
            await setStorageItem(STORAGE_KEY_REFRESH_TOKEN, tokenResult.refreshToken);
          }
          return tokenResult.accessToken;
        }
      } catch (authErr) {
        // Fallback a llamada REST directa
      }

      // 2. Fallback a fetch directo a oauth2.googleapis.com
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId || '',
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }).toString(),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error('Error al renovar token de Google:', res.status, errText);
        // Limpiar tokens inválidos para evitar bucle continuo de reintentos
        await removeStorageItem(STORAGE_KEY_TOKEN);
        await removeStorageItem(STORAGE_KEY_REFRESH_TOKEN);
        throw new Error('Tu sesión de Google expiró. Por favor vuelve a vincular tu cuenta.');
      }

      const data = await res.json();
      const newAccessToken = data.access_token;
      if (!newAccessToken) {
        await removeStorageItem(STORAGE_KEY_TOKEN);
        throw new Error('Google no devolvió un nuevo token de acceso.');
      }

      await setStorageItem(STORAGE_KEY_TOKEN, newAccessToken);
      return newAccessToken;
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}

/**
 * Obtiene un token de acceso vigente, renovándolo automáticamente si expiró.
 */
export async function getValidGoogleAccessToken(): Promise<string> {
  const currentToken = await getStoredGoogleToken();
  if (!currentToken) {
    const refreshToken = await getStorageItem(STORAGE_KEY_REFRESH_TOKEN);
    if (refreshToken) {
      return await refreshGoogleAccessToken();
    }
    throw new Error('No hay cuenta de Google vinculada.');
  }

  // Verificar rápidamente validez del token actual
  try {
    const checkRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${currentToken}`);
    if (checkRes.ok) {
      return currentToken;
    }
  } catch {}

  // Si no está vigente, renovarlo con el refresh token
  const refreshToken = await getStorageItem(STORAGE_KEY_REFRESH_TOKEN);
  if (refreshToken) {
    return await refreshGoogleAccessToken();
  }

  return currentToken;
}

/**
 * Desvincula la cuenta de Google y limpia los datos en caché de Drive.
 */
export async function disconnectGoogleAccount(): Promise<void> {
  await removeStorageItem(STORAGE_KEY_USER);
  await removeStorageItem(STORAGE_KEY_TOKEN);
  await removeStorageItem(STORAGE_KEY_REFRESH_TOKEN);
  await removeStorageItem(STORAGE_KEY_DRIVE_BACKUP);
  notifyGoogleUserChanged(null);
}

/**
 * Obtiene los metadatos de la copia de seguridad guardada en caché local.
 */
export async function getStoredDriveBackupMeta(): Promise<GoogleDriveBackupMetadata | null> {
  const str = await getStorageItem(STORAGE_KEY_DRIVE_BACKUP);
  if (!str) return null;
  try {
    return JSON.parse(str) as GoogleDriveBackupMetadata;
  } catch {
    return null;
  }
}

/**
 * Busca si existe el archivo de copia de seguridad en appDataFolder de Google Drive.
 * Incluye throttling de 1 minuto y deduplicación de peticiones concurrentes para no saturar la API.
 */
export async function findDriveBackupFile(
  tokenOrForce?: string | boolean,
  forceRefreshParam?: boolean
): Promise<GoogleDriveBackupMetadata | null> {
  const tokenParam = typeof tokenOrForce === 'string' ? tokenOrForce : undefined;
  const forceRefresh = typeof tokenOrForce === 'boolean' ? tokenOrForce : (forceRefreshParam ?? false);

  const now = Date.now();
  if (!forceRefresh && !tokenParam && (now - lastDriveQueryTime < DRIVE_QUERY_CACHE_MS)) {
    return await getStoredDriveBackupMeta();
  }

  if (activeFindDrivePromise) {
    return activeFindDrivePromise;
  }

  activeFindDrivePromise = (async () => {
    try {
      let accessToken = tokenParam;
      if (!accessToken) {
        try {
          accessToken = await getValidGoogleAccessToken();
        } catch {
          return await getStoredDriveBackupMeta();
        }
      }

      const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${GOOGLE_DRIVE_BACKUP_FILENAME}' and trashed=false&fields=files(id,name,modifiedTime,size)&pageSize=1`;

      let res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (res.status === 401) {
        console.warn('Google Drive token expirado, intentando renovar...');
        try {
          accessToken = await refreshGoogleAccessToken();
          res = await fetch(url, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });
        } catch {
          return await getStoredDriveBackupMeta();
        }
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.warn('Advertencia al consultar Google Drive:', res.status, errText);
        return await getStoredDriveBackupMeta();
      }

      const json = await res.json();
      lastDriveQueryTime = Date.now();

      if (Array.isArray(json.files) && json.files.length > 0) {
        const file = json.files[0];
        const meta: GoogleDriveBackupMetadata = {
          fileId: file.id,
          name: file.name,
          modifiedTime: file.modifiedTime,
          sizeBytes: file.size ? parseInt(file.size, 10) : undefined,
        };
        await setStorageItem(STORAGE_KEY_DRIVE_BACKUP, JSON.stringify(meta));
        return meta;
      }

      return null;
    } finally {
      activeFindDrivePromise = null;
    }
  })();

  return activeFindDrivePromise;
}

/**
 * Sube o actualiza la copia de seguridad completa en appDataFolder de Google Drive.
 */
export async function uploadBackupToGoogleDrive(tokenParam?: string): Promise<{
  success: boolean;
  metadata: GoogleDriveBackupMetadata;
  stats: YomiFullBackupPackage['metadata'];
}> {
  let accessToken = tokenParam;
  if (!accessToken) {
    accessToken = await getValidGoogleAccessToken();
  }

  const pkg = await createFullBackupPackage();
  const fileContent = JSON.stringify(pkg);
  const sizeBytes = new Blob([fileContent]).size;

  // 1. Verificar si ya existe una copia previa en appDataFolder
  const existingFile = await findDriveBackupFile(accessToken);

  const boundary = 'foo_bar_baz_yomi_boundary';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metaObj = existingFile
    ? { name: GOOGLE_DRIVE_BACKUP_FILENAME }
    : { name: GOOGLE_DRIVE_BACKUP_FILENAME, parents: ['appDataFolder'] };

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metaObj) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    fileContent +
    closeDelimiter;

  let uploadUrl: string;
  let method: string;

  if (existingFile) {
    uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.fileId}?uploadType=multipart`;
    method = 'PATCH';
  } else {
    uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    method = 'POST';
  }

  let uploadRes = await fetch(uploadUrl, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });

  // Si recibimos 401, reintentar automáticamente renovando el token
  if (uploadRes.status === 401) {
    console.warn('[GoogleDrive] Token expiró durante subida, renovando con refresh token...');
    try {
      accessToken = await refreshGoogleAccessToken();
      uploadRes = await fetch(uploadUrl, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody,
      });
    } catch (refreshErr) {
      console.error('[GoogleDrive] Falló renovación de token:', refreshErr);
    }
  }

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    console.error('Error al subir a Google Drive:', errText);
    let errorMsg = 'No se pudo guardar la copia en Google Drive.';
    try {
      const errJson = JSON.parse(errText);
      if (uploadRes.status === 401 || errJson.error?.code === 401) {
        errorMsg = 'Error 401 de autenticación en Google Drive. Tu sesión expiró, por favor vuelve a conectar tu cuenta.';
      } else if (uploadRes.status === 403 || errJson.error?.code === 403) {
        errorMsg = `Permiso denegado (403): ${errJson.error?.message || 'Verifica que la Google Drive API esté habilitada en Google Cloud.'}`;
      } else if (errJson.error?.message) {
        errorMsg = errJson.error.message;
      }
    } catch {}
    throw new Error(errorMsg);
  }

  const uploadResult = await uploadRes.json();
  const savedMeta: GoogleDriveBackupMetadata = {
    fileId: uploadResult.id,
    name: uploadResult.name,
    modifiedTime: uploadResult.modifiedTime || new Date().toISOString(),
    sizeBytes,
    decksCount: pkg.metadata.decksCount,
    wordsCount: pkg.metadata.wordsCount,
    srsCount: pkg.metadata.srsCount,
  };

  await setStorageItem(STORAGE_KEY_DRIVE_BACKUP, JSON.stringify(savedMeta));

  return {
    success: true,
    metadata: savedMeta,
    stats: pkg.metadata,
  };
}

/**
 * Descarga el contenido del archivo de copia de seguridad desde appDataFolder en Google Drive.
 */
export async function downloadBackupFromGoogleDrive(tokenParam?: string): Promise<string> {
  let accessToken = tokenParam;
  if (!accessToken) {
    accessToken = await getValidGoogleAccessToken();
  }

  const existingFile = await findDriveBackupFile(accessToken);
  if (!existingFile) {
    throw new Error('No se encontró ninguna copia de seguridad en tu cuenta de Google Drive.');
  }

  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${existingFile.fileId}?alt=media`;
  let res = await fetch(downloadUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (res.status === 401) {
    console.warn('[GoogleDrive] Token expiró durante descarga, renovando...');
    try {
      accessToken = await refreshGoogleAccessToken();
      res = await fetch(downloadUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch {}
  }

  if (!res.ok) {
    let msg = 'No se pudo descargar la copia de seguridad desde Google Drive.';
    if (res.status === 401) {
      msg = 'Error 401 de autenticación. Tu sesión expiró, por favor vuelve a conectar tu cuenta.';
    }
    throw new Error(msg);
  }

  const content = await res.text();
  return content;
}
