import { File, Paths } from 'expo-file-system';

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

async function readArrayBufferDirect(uri: string): Promise<ArrayBuffer> {
  const file = new File(uri);
  return file.arrayBuffer();
}

async function readArrayBufferViaFetch(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Could not read file (HTTP ${response.status}).`);
  }
  return response.arrayBuffer();
}

/** Copy into app cache first — DocumentPicker temp files are unreadable on SDK 57 Expo Go. */
async function readArrayBufferViaCopy(
  uri: string,
  fileName?: string,
): Promise<ArrayBuffer> {
  const source = new File(uri);
  const dest = new File(
    Paths.cache,
    `picked-${Date.now()}-${sanitizeFileName(fileName ?? 'import')}`,
  );
  await source.copy(dest, { overwrite: true });
  return dest.arrayBuffer();
}

/**
 * Read picked file bytes (content://, file://, SAF).
 * Never uses legacy readAsStringAsync — that fails on DocumentPicker cache paths in Expo Go SDK 57.
 */
export async function readPickedFileAsArrayBuffer(
  uri: string,
  fileName?: string,
): Promise<ArrayBuffer> {
  const attempts = [
    () => readArrayBufferViaFetch(uri),
    () => readArrayBufferDirect(uri),
    () => readArrayBufferViaCopy(uri, fileName),
  ];

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      const buffer = await attempt();
      if (buffer.byteLength > 0) return buffer;
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Could not read the selected file.');
}

export async function readPickedFileAsString(
  uri: string,
  encoding: 'utf8' | 'base64',
  fileName?: string,
): Promise<string> {
  const buffer = await readPickedFileAsArrayBuffer(uri, fileName);
  if (encoding === 'base64') {
    return bytesToBase64(new Uint8Array(buffer));
  }
  return new TextDecoder('utf-8').decode(buffer);
}
