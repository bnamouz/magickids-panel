/** Browser only. Phone photos are several megabytes; one request must stay under the platform's body limit. PDFs pass as they are. */
export async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if ((file.type === 'image/jpeg' || file.type === 'image/png') && file.size <= 600_000) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(done => canvas.toBlob(done, 'image/jpeg', 0.82));
    return blob ? new File([blob], file.name.replace(/\.[^.]*$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}
/** The file types the institute stores: photos and PDF. */
export const isStorableFile = (f: File) => ['image/jpeg', 'image/png', 'application/pdf'].includes(f.type);
