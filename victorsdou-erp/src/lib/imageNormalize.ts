import sharp from 'sharp';
import heicConvert from 'heic-convert';

/**
 * Prepara una imagen para el lector con IA.
 *  - image/jpg → image/jpeg (el proveedor solo acepta jpeg/png/gif/webp).
 *  - HEIC/HEIF (fotos de iPhone) → JPEG. Se detecta también por firma de archivo,
 *    porque Chrome/Windows suelen enviar file.type vacío.
 *  - Imágenes grandes (> ~3.5 MB o lado largo > 2000 px) → JPEG reducido (límite de la API: ~5 MB).
 * Lanza Error (mensaje en español) si no se puede convertir.
 */
const NATIVE = /^image\/(jpeg|png|gif|webp)$/;
const MAX_SIDE = 2000;
const MAX_BYTES = 3_500_000;

export interface NormalizedImage { mimeType: string; dataBase64: string }

function isHeicBuffer(buf: Buffer): boolean {
  if (buf.length < 12 || buf.toString('ascii', 4, 8) !== 'ftyp') return false;
  return ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(buf.toString('ascii', 8, 12));
}

export async function normalizeImageForLlm(mimeType: string, dataBase64: string): Promise<NormalizedImage> {
  let mime = (mimeType ?? '').toLowerCase().trim();
  if (mime === 'image/jpg' || mime === 'image/pjpeg') mime = 'image/jpeg';

  const maybeImage = mime.startsWith('image/') || mime === '' || mime === 'application/octet-stream';
  if (!maybeImage) return { mimeType: mime, dataBase64 };

  let buf = Buffer.from(dataBase64 ?? '', 'base64');
  const heic = /^image\/hei[cf]/.test(mime) || isHeicBuffer(buf);
  if (!mime.startsWith('image/') && !heic) return { mimeType: mime, dataBase64 };
  if (!buf.length) throw new Error('la imagen está vacía');

  if (heic) {
    try {
      buf = Buffer.from(await heicConvert({ buffer: buf, format: 'JPEG', quality: 0.85 }));
    } catch {
      throw new Error('no se pudo leer la foto HEIC/HEIF (expórtala como JPG)');
    }
    mime = 'image/jpeg';
  }

  let meta: sharp.Metadata;
  try {
    meta = await sharp(buf).metadata();
  } catch {
    throw new Error('el archivo no es una imagen válida');
  }
  const longSide = Math.max(meta.width ?? 0, meta.height ?? 0);
  const needsResize = longSide > MAX_SIDE || buf.length > MAX_BYTES;

  if (!needsResize && NATIVE.test(mime)) {
    return { mimeType: mime, dataBase64: heic ? buf.toString('base64') : dataBase64 };
  }

  try {
    let out = buf;
    for (const quality of [85, 70, 55]) {
      out = await sharp(buf)
        .rotate()
        .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality })
        .toBuffer();
      if (out.length <= MAX_BYTES) break;
    }
    return { mimeType: 'image/jpeg', dataBase64: out.toString('base64') };
  } catch {
    throw new Error('no se pudo convertir la imagen a JPEG');
  }
}
