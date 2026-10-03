import {getCurrentStaff} from '@/lib/admin/auth';
import {redirect} from 'next/navigation';
import Workspace from './workspace';
export default async function Page(){const s=await getCurrentStaff();if(!s)redirect('/admin/login');if(s.role!=='admin')return <p>הגישה למנהל המכון בלבד.</p>;return <Workspace/>;}
