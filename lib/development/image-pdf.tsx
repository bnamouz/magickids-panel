import React from 'react';
import {Document,Page,Image,renderToBuffer} from '@react-pdf/renderer';

export const IMAGE_TYPES: Record<string,'jpg'|'png'> = {'image/jpeg':'jpg','image/png':'png'};
/** Magic-byte check so a renamed file cannot pass as an image. */
export function detectImage(bytes:Buffer):'jpg'|'png'|null {
 if(bytes.length>3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return 'jpg';
 if(bytes.length>7&&bytes.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return 'png';
 return null;
}
/** Wraps one scanned page (JPEG/PNG) into a single A4 PDF page, fitted without cropping. */
export async function imageToPdf(bytes:Buffer,format:"jpg"|"png"):Promise<Buffer> {
 const src={data:bytes,format};
 return Buffer.from(await renderToBuffer(<Document><Page size="A4" style={{padding:18,display:'flex',alignItems:'center',justifyContent:'center'}}><Image src={src as any} style={{maxWidth:'100%',maxHeight:'100%',objectFit:'contain'}}/></Page></Document>));
}
