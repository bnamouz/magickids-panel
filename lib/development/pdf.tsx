import React from 'react';
import path from 'path';
import {Document,Page,Text,Font,renderToBuffer} from '@react-pdf/renderer';
Font.register({family:'DevelopmentHebrew',src:path.join(process.cwd(),'public/fonts/Assistant-Regular.ttf')});
export async function packetPdf(row:any) {
 const lines=[`מכון ילדי הקסם — ריכוז דיווחי התפתחות`,`שם הילד/ה: ${row.child_name}`,`תאריך לידה: ${row.birth_date}`,`הורה: ${row.parent_name}`,`נבדק ואושר: ${row.approved_at || ''}`,row.summary||''];
 return renderToBuffer(<Document><Page size="A4" style={{padding:35,fontFamily:'DevelopmentHebrew',fontSize:11,textAlign:'right'}}>{lines.map((line,i)=><Text key={i} style={{marginBottom:10}}>{line}</Text>)}</Page></Document>);
}
