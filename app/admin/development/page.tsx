import {getCurrentStaff,canEditReports} from '@/lib/admin/auth';
import {redirect} from 'next/navigation';
import Workspace from './workspace';
export default async function Page(){const staff=await getCurrentStaff();if(!staff)redirect('/admin/login');return <Workspace editable={canEditReports(staff)}/>;}
