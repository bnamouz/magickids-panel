import {nationalIdLabels,nationalIdSchema} from '@/lib/shared/national-id';
export default function NationalIdField({language='he',disabled=false}:{language?:keyof typeof nationalIdLabels;disabled?:boolean}){
 const error={he:'יש להזין תעודת זהות תקינה של הילד/ה בת 9 ספרות.',ar:'يرجى إدخال رقم هوية صحيح للطفل/ة مكوّن من 9 أرقام.',en:'Enter a valid 9-digit Israeli ID number for the child.'}[language];
 return <label className="block">{nationalIdLabels[language]}<input name="national_id" required type="text" inputMode="numeric" dir="ltr" minLength={9} maxLength={9} pattern="[0-9٠-٩۰-۹]{9}" autoComplete="off" disabled={disabled} onInput={e=>e.currentTarget.setCustomValidity(nationalIdSchema.safeParse(e.currentTarget.value).success?'':error)} className="input w-full border p-3 rounded-lg mt-1"/></label>;
}
