import {requireStaff} from '@/lib/admin/auth';
import CaseEditor from '@/components/admin/CaseEditor';
export default async function EditCase({params}:{params:{id:string}}){await requireStaff();return <CaseEditor id={params.id}/>;}
