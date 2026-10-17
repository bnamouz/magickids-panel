export type Phase='confirmation'|'day-before'|'same-day';
export function duePhase(start:string, now=new Date()):Phase|null {
 const minutes=(Date.parse(start)-now.getTime())/60000;
 // Five-minute scheduler, with a bounded recovery window. Never send after a visit.
 if(minutes>1380&&minutes<=1440)return 'day-before';
 if(minutes>60&&minutes<=120)return 'same-day';
 return null;
}
export function messageKey(calendar:string,event:string,start:string,phase:Phase){
 return `appointment-v2:${calendar}:${event}:${new Date(start).toISOString()}:${phase}`;
}
export function phoneNumber(phone:string){
 const digits=phone.replace(/\D/g,'');
 const n=digits.startsWith('0')?`+972${digits.slice(1)}`:`+${digits}`;
 return /^\+[1-9]\d{6,14}$/.test(n)?n:null;
}
export function appointmentText(start:string,phase:Phase,language:string){
 const lang=language==='ar'?'ar':language==='en'?'en':'he';
 const when=new Intl.DateTimeFormat(lang==='en'?'en-GB':`${lang}-IL`,{timeZone:'Asia/Jerusalem',dateStyle:'full',timeStyle:'short'}).format(new Date(start));
 if(lang==='ar')return `${phase==='confirmation'?'تم تأكيد موعدكم':phase==='day-before'?'تذكير بموعدكم غدًا':'تذكير بموعدكم اليوم'} في معهد أطفال السحر / عيادة د. نموز: ${when} (توقيت إسرائيل). لتغيير الموعد أو إلغائه يرجى التواصل مع العيادة.`;
 if(lang==='en')return `${phase==='confirmation'?'Your appointment is confirmed':phase==='day-before'?'Reminder of your appointment tomorrow':'Reminder of your appointment today'} at Magic Kids / Dr. Namouz’s clinic: ${when} (Israel time). Contact the clinic to change or cancel.`;
 return `${phase==='confirmation'?'התור שלכם אושר':phase==='day-before'?'תזכורת לתור שלכם מחר':'תזכורת לתור שלכם היום'} במכון ילדי הקסם / מרפאת ד״ר נמוז: ${when} (שעון ישראל). לשינוי או לביטול התור פנו למרפאה.`;
}
