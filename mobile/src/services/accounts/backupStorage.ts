import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LegacyFS from 'expo-file-system/legacy';
import { File } from 'expo-file-system';

export const BACKUP_FOLDER_NAME = 'Nepse Ghar';
const BACKUP_DIR_URI_KEY = '@nepse_ghar/backup_dir_uri';
const ANDROID_DOWNLOADS_ROOT = 'Download';

export type SavedBackupResult = {
  uri: string;
  savedPath: string;
  fileName: string;
};

type WritePayload =
  | { kind: 'text'; content: string }
  | { kind: 'base64'; content: string };

export function backupFolderHint(): string {
  return Platform.OS === 'android'
    ? `Download/${BACKUP_FOLDER_NAME}`
    : BACKUP_FOLDER_NAME;
}

async function ensureIosBackupDirectoryUri(): Promise<string> {
  const root = LegacyFS.documentDirectory;
  if (!root) {
    throw new Error('Storage is not available on this device.');
  }
  const dirUri = `${root}${BACKUP_FOLDER_NAME}/`;
  await LegacyFS.makeDirectoryAsync(dirUri, { intermediates: true });
  return dirUri;
}

async function ensureAndroidBackupFolderUri(
  forceRefresh = false,
): Promise<string> {
  if (!forceRefresh) {
    const cached = await AsyncStorage.getItem(BACKUP_DIR_URI_KEY);
    if (cached) return cached;
  }

  const { StorageAccessFramework } = LegacyFS;
  const downloadHint =
    StorageAccessFramework.getUriForDirectoryInRoot(ANDROID_DOWNLOADS_ROOT);
  const permissions =
    await StorageAccessFramework.requestDirectoryPermissionsAsync(downloadHint);
  if (!permissions.granted) {
    throw new Error(
      `Allow access to Downloads so NEPSE GHAR can save backups in ${backupFolderHint()}.`,
    );
  }

  let folderUri = '';
  try {
    folderUri = await StorageAccessFramework.makeDirectoryAsync(
      permissions.directoryUri,
      BACKUP_FOLDER_NAME,
    );
  } catch {
    const children = await StorageAccessFramework.readDirectoryAsync(
      permissions.directoryUri,
    );
    const needle = BACKUP_FOLDER_NAME.toLowerCase();
    const match = children.find((uri) =>
      decodeURIComponent(uri).toLowerCase().includes(needle),
    );
    if (!match) {
      throw new Error(`Could not create ${BACKUP_FOLDER_NAME} in Downloads.`);
    }
    folderUri = match;
  }

  await AsyncStorage.setItem(BACKUP_DIR_URI_KEY, folderUri);
  return folderUri;
}

function splitFileName(fileName: string): { base: string; mimeType: string } {
  const dot = fileName.lastIndexOf('.');
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
  const base = dot >= 0 ? fileName.slice(0, dot) : fileName;
  const mimeType =
    ext === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : ext === 'csv'
        ? 'text/csv'
        : ext === 'json'
          ? 'application/json'
          : 'application/octet-stream';
  return { base, mimeType };
}

async function writeAndroidBackupFile(
  folderUri: string,
  fileName: string,
  payload: WritePayload,
): Promise<string> {
  const { StorageAccessFramework } = LegacyFS;
  const { base, mimeType } = splitFileName(fileName);
  const fileUri = await StorageAccessFramework.createFileAsync(
    folderUri,
    base,
    mimeType,
  );
  await StorageAccessFramework.writeAsStringAsync(
    fileUri,
    payload.content,
    {
      encoding:
        payload.kind === 'base64'
          ? LegacyFS.EncodingType.Base64
          : LegacyFS.EncodingType.UTF8,
    },
  );
  return fileUri;
}

async function writeIosBackupFile(
  dirUri: string,
  fileName: string,
  payload: WritePayload,
): Promise<string> {
  const fileUri = `${dirUri}${fileName}`;
  await LegacyFS.writeAsStringAsync(fileUri, payload.content, {
    encoding:
      payload.kind === 'base64'
        ? LegacyFS.EncodingType.Base64
        : LegacyFS.EncodingType.UTF8,
  });
  return fileUri;
}

export async function saveBackupFile(
  fileName: string,
  payload: WritePayload,
): Promise<SavedBackupResult> {
  const savedPath = `${backupFolderHint()}/${fileName}`;

  if (Platform.OS === 'android') {
    try {
      const folderUri = await ensureAndroidBackupFolderUri();
      const uri = await writeAndroidBackupFile(folderUri, fileName, payload);
      return { uri, savedPath, fileName };
    } catch {
      await AsyncStorage.removeItem(BACKUP_DIR_URI_KEY);
      const folderUri = await ensureAndroidBackupFolderUri(true);
      const uri = await writeAndroidBackupFile(folderUri, fileName, payload);
      return { uri, savedPath, fileName };
    }
  }

  const dirUri = await ensureIosBackupDirectoryUri();
  const uri = await writeIosBackupFile(dirUri, fileName, payload);
  return { uri, savedPath, fileName };
}

export async function pickBackupFileFromFolder(): Promise<
  { name: string; uri: string } | 'canceled' | null
> {
  let folderReady = false;
  try {
    let folderUri: string | null = null;
    if (Platform.OS === 'android') {
      folderUri = await AsyncStorage.getItem(BACKUP_DIR_URI_KEY);
    } else {
      folderUri = await ensureIosBackupDirectoryUri();
    }
    if (!folderUri) return null;
    folderReady = true;

    const file = await File.pickFileAsync(folderUri, '*/*');
    if (!file?.uri) return 'canceled';
    return { name: file.name, uri: file.uri };
  } catch {
    return folderReady ? 'canceled' : null;
  }
}
