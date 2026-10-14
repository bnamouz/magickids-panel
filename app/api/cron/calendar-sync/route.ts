import {cleanupCaseFiles} from '@/lib/intake/delete-files';
import {timingSafeEqual} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {reconcileCalendars} from '@/lib/calendar-reconcile';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function GET(req:NextRequest){
 const secret=process.env.CRON_SECRET,actual=Buffer.from(req.headers.get('authorization')??''),expected=Buffer.from(`Bearer ${secret}`);
 if(!secret||secret.length<32||actual.length!==expected.length||!timingSafeEqual(actual,expected))return NextResponse.json({error:'forbidden'},{status:403});
 try{const deletionCleanup=await cleanupCaseFiles().catch(()=>({error:true}));return NextResponse.json({...await reconcileCalendars(),deletionCleanup},{headers:{'Cache-Control':'no-store'}});}
 catch{return NextResponse.json({error:'unavailable'},{status:503});}
}
