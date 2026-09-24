// Preserve OCR reading order with continuous inline rows. Independent absolute
// word boxes leave hit-testing gaps that Chrome can resolve to an earlier line.
export function createOcrTextLayer(result, viewport) {
 const layer=document.createElement('div');layer.className='ocr-text-layer';
 const rotation=((viewport.rotation-result.rotation)%360+360)%360;
 const radians=rotation*Math.PI/180,cos=Math.cos(radians),sin=Math.sin(radians);
 const project=point=>{const [x,y]=viewport.convertToViewportPoint(...point);return [x*cos+y*sin,-x*sin+y*cos];};
 // Rotate the shared coordinate system, not individual lines. Chrome then
 // resolves drag carets in one normal reading plane, including reverse drags.
 const originX=rotation===180?-viewport.width:rotation===270?-viewport.height:0;
 const originY=rotation===90?-viewport.width:rotation===180?-viewport.height:0;
 Object.assign(layer.style,{width:(rotation%180?viewport.height:viewport.width)+'px',height:(rotation%180?viewport.width:viewport.height)+'px',transformOrigin:'0 0',transform:`matrix(${cos},${sin},${-sin},${cos},${originX*cos-originY*sin},${originX*sin+originY*cos})`});
 const rows=new Map();
 for(const word of result.words){
  const a=project(word.topLeft),b=project(word.topRight),c=project(word.bottomLeft);
  const width=b[0]-a[0],height=c[1]-a[1];if(width<.1||height<.1)continue;
  if(!rows.has(word.line))rows.set(word.line,[]);
  rows.get(word.line).push({...word,x:a[0],y:a[1],width,height});
 }
 const context=document.createElement('canvas').getContext('2d');
 for(const words of rows.values()){
  const left=Math.min(...words.map(w=>w.x)),top=Math.min(...words.map(w=>w.y));
  const right=Math.max(...words.map(w=>w.x+w.width)),bottom=Math.max(...words.map(w=>w.y+w.height)),height=bottom-top;
  const row=document.createElement('div');row.className='ocr-text-line';
  Object.assign(row.style,{left:(left-originX)+'px',top:(top-originY)+'px',width:(right-left)+'px',height:height+'px',fontSize:height+'px'});
  context.font=height+'px sans-serif';
  for(let i=0;i<words.length;i++){
   const word=words[i],next=words[i+1];
   const slot=document.createElement('span');slot.className='ocr-text-word';
   slot.style.width=(next?Math.max(0,next.x-word.x):word.width)+'px';
   const glyphs=document.createElement('span');glyphs.className='ocr-text-glyphs';
   glyphs.textContent=word.text+(word.separator==='\n'?'':word.separator);
   glyphs.style.transform=`scaleX(${word.width/(context.measureText(word.text).width||word.width)})`;
   slot.append(glyphs);row.append(slot);
  }
  // A real line boundary keeps multi-line copy readable without injecting text
  // into each positioned word or adding selection handlers on mouse movement.
  row.append(document.createElement('br'));layer.append(row);
 }
 return layer;
}
