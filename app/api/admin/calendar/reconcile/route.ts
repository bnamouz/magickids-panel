import {NextRequest,NextResponse} from 'next/server';
import {getCurrentStaff} from '@/lib/admin/auth';
import {reconcileCalendars} from '@/lib/calendar-reconcile';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function POST(req:NextRequest){
 if(!await getCurrentStaff()||req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({error:'forbidden'},{status:403});
 try{return NextResponse.json(await reconcileCalendars(),{headers:{'Cache-Control':'no-store'}});}
 catch{return NextResponse.json({error:'unavailable'},{status:503});}
}
