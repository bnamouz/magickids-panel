import { google } from 'googleapis';
import { buildMessage, SENDER } from './mime';

const SCOPE = 'https://www.googleapis.com/auth/gmail.send';
function credentials() {
 const raw = process.env.DEVELOPMENT_GOOGLE_SERVICE_ACCOUNT_JSON;
 if (!raw) throw new Error('MAIL_NOT_CONFIGURED');
 const value = JSON.parse(raw);
 if (value.type !== 'service_account' || typeof value.client_email !== 'string' ||
     typeof value.private_key !== 'string' || !value.private_key.includes('BEGIN PRIVATE KEY')) {
  throw new Error('MAIL_NOT_CONFIGURED');
 }
 return value;
}
// Configuration presence is not proof of delegated authorization or delivery.
export function mailReady() { try { credentials(); return true; } catch { return false; } }
export async function sendPacket(id:string, attachments:{filename:string;content:string}[]) {
 const value = credentials();
 const auth = new google.auth.JWT({email:value.client_email, key:value.private_key,
  scopes:[SCOPE], subject:SENDER});
 const gmail = google.gmail({version:'v1', auth});
 // Gmail has no idempotency key. The database's single dispatch claim remains mandatory.
 // Never retry an ambiguous send; inspect Sent mail by Message-ID before recovery.
 const response = await gmail.users.messages.send({userId:'me',
  requestBody:{raw:buildMessage(id,attachments)}}, {retry:false,timeout:20000});
 if (!response.data.id) throw new Error('MAIL_UNKNOWN');
 return response.data.id;
}
