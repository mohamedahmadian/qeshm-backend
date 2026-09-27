/**
 * Multer reads multipart filenames as latin1 unless `defParamCharset` is utf8.
 * A Persian name then shows up as mojibake. This restores UTF-8 and leaves
 * names that are already Unicode (or plain ASCII) unchanged.
 */
export function decodeUploadedFileName(name: string | null | undefined, fallback = ''): string {
  const trimmed = name?.trim() || fallback;
  if (!trimmed) return fallback;
  if (/[^\u0000-\u00ff]/.test(trimmed)) return trimmed;
  const decoded = Buffer.from(trimmed, 'latin1').toString('utf8');
  if (!decoded || decoded.includes('\uFFFD') || decoded === trimmed) return trimmed;
  return decoded;
}
