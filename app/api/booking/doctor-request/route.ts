import { NextRequest, NextResponse } from 'next/server';
import { submitDoctorRequest } from '@/lib/booking/doctor-requests';
import { BookingError } from '@/lib/booking/server';
export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';
const reply = (body:unknown,status=200) => NextResponse.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
export async function POST(req:NextRequest) {
  if(req.headers.get('origin')!==req.nextUrl.origin) return reply({error:'invalid_origin'},403);
  if(!req.headers.get('content-type')?.startsWith('application/json')) return reply({error:'invalid_body'},400);
  if(Number(req.headers.get('content-length'))>8192) return reply({error:'invalid_body'},413);
  try {
    const raw=await req.text();
    if(raw.length>8192) return reply({error:'invalid_body'},413);
    let body;try{body=JSON.parse(raw);}catch{return reply({error:'invalid_body'},400);}
    return reply(await submitDoctorRequest(body,req.ip||'unknown'));
  }catch(error){return reply({error:error instanceof BookingError?error.code:'unavailable'},error instanceof BookingError?error.status:503);}
}
