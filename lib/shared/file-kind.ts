/** Recognises JPEG, PNG and PDF by their first bytes; the browser-reported type is not trusted. */
export function fileKind(b: Uint8Array): { type: 'image/jpeg' | 'image/png' | 'application/pdf'; ext: 'jpg' | 'png' | 'pdf' } | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return { type: 'image/png', ext: 'png' };
  if ([0x25, 0x50, 0x44, 0x46, 0x2d].every((v, i) => b[i] === v)) return { type: 'application/pdf', ext: 'pdf' };
  return null;
}
