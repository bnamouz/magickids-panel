// Read-only check. Run with `vercel env run -e production -- node <this-file>`.
// Never prints environment values, tokens, private keys or event contents.
import { google } from 'googleapis';
const calendarId='c_00c78f49814f6b6aace3c0798289964c531c12d5f253f2c452b1d395048fb4a5@group.calendar.google.com';
try {
  const json=process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if(!json)throw new Error('calendar_credentials_missing');
  const c=JSON.parse(json);
  const auth=new google.auth.JWT({email:c.client_email,key:c.private_key,
    scopes:['https://www.googleapis.com/auth/calendar'],subject:process.env.GOOGLE_IMPERSONATE_USER?.trim()||undefined});
  const calendar=google.calendar({version:'v3',auth});
  const meta=await calendar.calendars.get({calendarId});
  const result=await calendar.freebusy.query({requestBody:{timeMin:new Date().toISOString(),timeMax:new Date(Date.now()+86400000).toISOString(),items:[{id:calendarId}]}});
  const fb=result.data.calendars?.[calendarId];
  console.log(JSON.stringify({ok:!fb?.errors?.length&&Array.isArray(fb?.busy),calendarId,
    summary:meta.data.summary,timeZone:meta.data.timeZone,freeBusyErrors:fb?.errors?.map(e=>e.reason)||[],
    serviceAccount:c.client_email,impersonatedUser:process.env.GOOGLE_IMPERSONATE_USER?.trim()||null}));
} catch(e) {
  const message=String(e.message||'');
  const reason=e instanceof SyntaxError?'invalid_credentials_json':
    ['calendar_credentials_missing','unauthorized_client','invalid_grant','invalid_client','access_denied','ENOTFOUND','DECODER routines','Could not load the default credentials'].find(x=>message.includes(x))||e.errors?.[0]?.reason||'calendar_access_unverified';
  console.log(JSON.stringify({ok:false,status:e.code||e.response?.status||null,reason,errorType:e.name})); process.exitCode=1;
}
