/** Physical addresses. The institute (ADHD / Magic Kids) and the pediatric clinic are at different streets in Shefa-Amr. */
export const ADDRESS = {
  institute: { he: 'דאהר עומר אלזידאני 9, שפרעם', ar: 'ظاهر عمر الزيداني 9، شفاعمرو', en: '9 Daher Omar Al-Zaydani St., Shefa-Amr' },
  pediatrics: { he: 'תופיק זיאד 21, שפרעם', ar: 'توفيق زياد 21، شفاعمرو', en: '21 Tawfiq Ziad St., Shefa-Amr' },
} as const;
export type Lang = keyof typeof ADDRESS.institute;
export const addressFor = (clinic: 'adhd' | 'pediatrics', lang: Lang) => ADDRESS[clinic === 'pediatrics' ? 'pediatrics' : 'institute'][lang];
/** Public Google Maps pin of the institute (מכון ילדי הקסם, Shefa-Amr). Shown with every institute appointment. */
export const INSTITUTE_MAP_URL = 'https://maps.app.goo.gl/MG3eHopWuLA4imPH8';
export const mapLineFor = (clinic: 'adhd' | 'pediatrics', lang: Lang) =>
  clinic === 'pediatrics' ? '' : { he: `\nניווט למכון: ${INSTITUTE_MAP_URL}`, ar: `\nموقع المعهد على الخريطة: ${INSTITUTE_MAP_URL}`, en: `\nDirections: ${INSTITUTE_MAP_URL}` }[lang];
