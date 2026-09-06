import * as LegacyFS from 'expo-file-system/legacy';
import { File } from 'expo-file-system';

function sanitizeFileName(name: string): string {
  const trimmed = name.trim() || 'import';
  return trimmed.replace(/[^\w.\-() ]+/g, '_');
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function readViaNewFileApi(
  uri: string,
  encoding: 'utf8' | 'base64',
): Promise<string> {
  const file = new File(uri);
  if (encoding === 'utf8') {
    return file.text();
  }
  const buffer = await file.arrayBuffer();
  return bytesToBase64(new Uint8Array(buffer));
}

/** Legacy copy fallback when the new File API cannot read the picked URI. */
async function readViaLegacyCopy(
  uri: string,
  encoding: 'utf8' | 'base64',
  fileName?: string,
): Promise<string> {
  const cache = LegacyFS.cacheDirectory;
  if (!cache) {
    throw new Error('Storage is not available on this device.');
  }

  const dest = `${cache}picked-${Date.now()}-${sanitizeFileName(fileName ?? 'import')}`;
  await LegacyFS.copyAsync({ from: uri, to: dest });
  return LegacyFS.readAsStringAsync(dest, {
    encoding:
      encoding === 'base64'
        ? LegacyFS.EncodingType.Base64
        : LegacyFS.EncodingType.UTF8,
  });
}

/**
 * Read a document-picker / SAF / content URI as text or base64.
 * SDK 57 Expo Go: DocumentPicker cache file:// paths are not readable via legacy FS.
 */
export async function readPickedFileAsString(
  uri: string,
  encoding: 'utf8' | 'base64',
  fileName?: string,
): Promise<string> {
  try {
    return await readViaNewFileApi(uri, encoding);
  } catch {
    return readViaLegacyCopy(uri, encoding, fileName);
  }
}
