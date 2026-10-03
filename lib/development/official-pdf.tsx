import React from 'react';
import path from 'node:path';
import {Document,Page,Image,Text,View,Font,renderToBuffer} from '@react-pdf/renderer';
import {officialPages} from './official';
Font.register({family:'OfficialHebrew',src:path.join(process.cwd(),'public/fonts/Assistant-Regular.ttf')});
// Preserve every original question as a background. Full text answers are also
// printed below in an appendix so long responses can never be silently clipped.
export async function originalPdf(row:any,role:string){
 const pages=officialPages(row.form_template,role),answers:Record<string,string>=role==='parent'?row.parent_answers:row.education_answers;
 return renderToBuffer(<Document>{pages.map(p=><Page key={p.page} size={[p.width,p.height]} style={{position:'relative'}}><Image src={path.join(process.cwd(),'public',p.image)} style={{position:'absolute',top:0,left:0,width:p.width,height:p.height}}/>{p.fields.map((f,i)=>{const value=answers[f.id];if(!value)return null;const [x,y,w,h]=f.rect;return <View key={i} style={{position:'absolute',left:x*p.width/100,top:y*p.height/100,width:w*p.width/100,height:h*p.height/100,overflow:'hidden'}}>{f.type==='text'?<Text style={{fontFamily:'OfficialHebrew',fontSize:7,textAlign:'right',backgroundColor:'white'}}>{value}</Text>:value===f.value?<Text style={{fontSize:9,textAlign:'center'}}>X</Text>:null}</View>;})}</Page>)}<Page size="A4" style={{padding:30,fontFamily:'OfficialHebrew',fontSize:10,textAlign:'right'}}><Text>נספח תשובות מלא — להבטחת הצגת תשובות ארוכות במלואן</Text>{pages.flatMap(p=>p.fields.filter(f=>f.type==='text'&&answers[f.id]).map(f=><View key={`${p.page}-${f.id}`} style={{marginTop:9}}><Text>עמוד {p.page} · {f.name}</Text><Text>{answers[f.id]}</Text></View>))}</Page></Document>);
}
