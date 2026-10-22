// Small original PDF fixture: static appearances, a canonical filled field,
// print flags, plain later pages, and an inert JavaScript open action.
export function reviewedPdf() {
  const objects=['','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const add=value=>(objects.push(value),objects.length);
  const stream=(content,extra='')=>add(`<< /Length ${content.length} ${extra} >>\nstream\n${content}\nendstream`);
  const appearance=(width,height,content)=>stream(content,`/Type /XObject /Subtype /Form /BBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R >> >>`);
  const annots=[];
  const highlight=appearance(200,28,'1 1 0 rg 0 0 200 28 re f');
  annots.push(add(`<< /Type /Annot /Subtype /Highlight /Rect [50 640 250 668] /QuadPoints [50 668 250 668 50 640 250 640] /C [1 1 0] /F 4 /Contents (Highlighted finding) /AP << /N ${highlight} 0 R >> >>`));
  const note=appearance(24,24,'1 .5 0 rg 0 0 24 24 re f 0 G 2 w 4 6 m 20 6 l S');
  annots.push(add(`<< /Type /Annot /Subtype /Text /Rect [50 590 74 614] /F 4 /Contents (A review note) /AP << /N ${note} 0 R >> >>`));
  const stamp=appearance(200,38,'.1 .65 .2 rg 0 0 200 38 re f 1 g BT /F1 22 Tf 25 10 Td (APPROVED) Tj ET');
  annots.push(add(`<< /Type /Annot /Subtype /Stamp /Rect [50 510 250 548] /F 4 /Name /Approved /AP << /N ${stamp} 0 R >> >>`));
  const fieldAppearance=appearance(200,30,'.85 .93 1 rg 0 0 200 30 re f 0 g BT /F1 18 Tf 8 8 Td (Zhang San) Tj ET');
  const widget=add(`<< /Type /Annot /Subtype /Widget /FT /Tx /T (FullName) /V (Zhang San) /DA (/F1 18 Tf 0 g) /Rect [50 430 250 460] /F 4 /AP << /N ${fieldAppearance} 0 R >> >>`);annots.push(widget);
  const ink=appearance(200,28,'0 0 1 RG 4 w 5 5 m 60 23 l 120 5 l 195 23 l S');
  annots.push(add(`<< /Type /Annot /Subtype /Ink /Rect [50 360 250 388] /InkList [[55 365 110 383 170 365 245 383]] /F 4 /AP << /N ${ink} 0 R >> >>`));
  const link=add('<< /Type /Annot /Subtype /Link /Rect [320 640 470 668] /A << /S /URI /URI (https://example.edu/) >> >>');annots.push(link);
  const pages=[];
  for(let index=0;index<12;index++){
    const content=stream(`0 g BT /F1 22 Tf 50 740 Td (Review fixture page ${index+1}) Tj ET\nBT /F1 11 Tf 50 700 Td (${index===11?'UNIQUE_FINAL_PAGE_NEEDLE':'Static original document text'}) Tj ET\n`);
    pages.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${content} 0 R ${index===0?'/Annots ['+annots.map(n=>n+' 0 R').join(' ')+']':''} >>`));
  }
  objects[0]=`<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [${widget} 0 R] /NeedAppearances false /DR << /Font << /F1 3 0 R >> >> >> /OpenAction << /S /JavaScript /JS (globalThis.PDF_ATTACK=true) >> >>`;
  objects[1]=`<< /Type /Pages /Kids [${pages.map(n=>n+' 0 R').join(' ')}] /Count ${pages.length} >>`;
  let pdf='%PDF-1.7\n';const offsets=[0];
  objects.forEach((object,index)=>{offsets.push(pdf.length);pdf+=`${index+1} 0 obj\n${object}\nendobj\n`;});
  const xref=pdf.length;
  pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('');
  pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
