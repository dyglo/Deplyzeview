export type SupportedImageMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export interface AiQuantImageAttachment {
  id: string;
  name: string;
  mimeType: SupportedImageMime;
  sizeBytes: number;
  dataUrl: string;
}

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per image
export const MAX_ATTACHMENTS_PER_PROMPT = 4;

export const SUPPORTED_IMAGE_MIMES: readonly SupportedImageMime[] = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

/**
 * Inspects binary header magic bytes to determine the actual image format.
 * DeepSeek Vision detects image format from content headers rather than file extensions.
 */
export function detectImageMimeFromBytes(bytes: Uint8Array): SupportedImageMime | null {
  if (!bytes || bytes.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // GIF: "GIF87a" or "GIF89a"
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return 'image/gif';
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function validateAndEncodeImage(
  name: string,
  bytes: Uint8Array,
  declaredMime?: string,
  existingCount = 0,
): AiQuantImageAttachment {
  if (existingCount >= MAX_ATTACHMENTS_PER_PROMPT) {
    throw new Error(`You can attach up to ${MAX_ATTACHMENTS_PER_PROMPT} reference images per request.`);
  }
  if (!bytes || bytes.byteLength === 0) {
    throw new Error(`Image "${name || 'attachment'}" is empty.`);
  }
  if (bytes.byteLength > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(`Image "${name || 'attachment'}" exceeds the 10 MB size limit.`);
  }

  const detectedMime = detectImageMimeFromBytes(bytes);
  if (!detectedMime) {
    throw new Error(
      `Unsupported image format for "${name || 'attachment'}". Please attach a valid JPEG, PNG, GIF, or WebP image.`,
    );
  }

  if (
    declaredMime &&
    declaredMime.trim() !== '' &&
    declaredMime !== 'application/octet-stream' &&
    !SUPPORTED_IMAGE_MIMES.includes(declaredMime.toLowerCase() as SupportedImageMime)
  ) {
    throw new Error(
      `Unsupported MIME type "${declaredMime}" for "${name}". Supported formats: JPEG, PNG, GIF, WebP.`,
    );
  }

  const base64 = bytesToBase64(bytes);
  const dataUrl = `data:${detectedMime};base64,${base64}`;
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    name: name.trim() || `reference.${detectedMime.split('/')[1]}`,
    mimeType: detectedMime,
    sizeBytes: bytes.byteLength,
    dataUrl,
  };
}

export async function readFileAsAttachment(
  file: File,
  existingCount = 0,
): Promise<AiQuantImageAttachment> {
  if (file.size === 0) {
    throw new Error(`Image "${file.name}" is empty.`);
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(`Image "${file.name}" exceeds the 10 MB size limit.`);
  }
  const buffer = await file.arrayBuffer();
  return validateAndEncodeImage(file.name, new Uint8Array(buffer), file.type, existingCount);
}
