export const OCR_LIMITS=Object.freeze({pages:20, pixels:4*1024*1024, dimension:4096, words:12000, characters:500000, timeout:120000});
export function ocrRange(from,to,total){from=Number(from);to=Number(to);return Number.isInteger(from)&&Number.isInteger(to)&&from>=1&&to>=from&&to<=total&&to-from<OCR_LIMITS.pages?{from,to}:null;}
export function ocrScale(width,height,quality){return Math.min(quality,Math.sqrt(OCR_LIMITS.pixels/(width*height)),OCR_LIMITS.dimension/width,OCR_LIMITS.dimension/height);}
export function ocrWords(blocks,width,height){
 const words=[];
 for(const block of blocks||[])for(const p of block.paragraphs||[])for(const line of p.lines||[])for(const word of line.words||[]){
  if(words.length>=OCR_LIMITS.words)return words;
  const box=word.bbox, text=String(word.text||'').slice(0,256);if(!box||!text||![box.x0,box.x1,box.y0,box.y1].every(Number.isFinite))continue;
  const x0=Math.max(0,box.x0),y0=Math.max(0,box.y0),x1=Math.min(width,box.x1),y1=Math.min(height,box.y1);
  if(x1>x0&&y1>y0)words.push({text,x0,y0,x1,y1});
 }
 return words;
}
