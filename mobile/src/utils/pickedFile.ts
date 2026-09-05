import * as FileSystem from 'expo-file-system/legacy';

function sanitizeFileName(name: string): string {
  const trimmed = name.trim() || 'import';
  return trimmed.replace(/[^\w.\-() ]+/g, '_');
}

/** Legacy FileSystem.readAsStringAsync only accepts file:// (and some SAF URIs), not Android content://. */
async function toReadableFileUri(uri: string, fileName?: string): Promise<string> {
  if (uri.startsWith('file://')) return uri;

  const cache = FileSystem.cacheDirectory;
  if (!cache) {
    throw new Error('Storage is not available on this device.');
  }

  const dest = `${cache}picked-${Date.now()}-${sanitizeFileName(fileName ?? 'import')}`;
  await FileSystem.copyAsync({ from: uri, to: dest });
  return dest;
}

export async function readPickedFileAsString(
  uri: string,
  encoding: 'utf8' | 'base64',
  fileName?: string,
): Promise<string> {
  const readableUri = await toReadableFileUri(uri, fileName);
  return FileSystem.readAsStringAsync(readableUri, {
    encoding:
      encoding === 'base64'
        ? FileSystem.EncodingType.Base64
        : FileSystem.EncodingType.UTF8,
  });
}
