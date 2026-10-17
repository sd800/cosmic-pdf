import { Lexer } from '../../vendor/marked/marked.esm.js';
import { AI_LIMITS } from '../../core/ai.js';

// Use Markdown tokens, never Marked's HTML renderer. Model-provided tags,
// attributes, images and URLs cannot create executable or fetching elements.
const entities = Object.freeze({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:'\u00a0',copy:'©',reg:'®',ndash:'–',mdash:'—',hellip:'…'});
function references(text) {
  return text.replace(/&(#(?:x[\da-f]+|\d+)|[a-z]+);/gi,(raw,name)=>{
    if(name[0]!=='#')return Object.hasOwn(entities,name)?entities[name]:raw;
    const number=name[1].toLowerCase()==='x'?parseInt(name.slice(2),16):Number(name.slice(1));
    return number>0&&number<=0x10ffff&&!(number>=0xd800&&number<=0xdfff)?String.fromCodePoint(number):'\ufffd';
  });
}
const element=(tag,children=[],extra={})=>({tag,children,...extra});
const literal=text=>element('span',[text],{literal:true});
export function aiAnswerTree(value) {
  const text=String(value).slice(0,AI_LIMITS.output);let remaining=4096;
  function tokens(items,depth=0) {
    if(depth>32)throw Error('formatLimit');
    const result=[];
    for(const token of items||[]){
      if(--remaining<0)throw Error('formatLimit');
      const children=()=>tokens(token.tokens,depth+1);
      switch(token.type){
        case 'space':break;
        case 'text':result.push(...(token.tokens?children():[references(token.text)]));break;
        case 'escape':result.push(token.text);break;
        case 'paragraph':result.push(element('p',children()));break;
        case 'heading':result.push(element(['h1','h2','h3','h4','h5','h6'][token.depth-1]||'h3',children()));break;
        case 'strong':case 'em':case 'del':case 'blockquote':result.push(element(token.type,children()));break;
        case 'codespan':result.push(element('code',[token.text]));break;
        case 'code':result.push(element('pre',[element('code',[token.text])]));break;
        case 'br':case 'hr':result.push(element(token.type));break;
        case 'list':{
          const start=Number.isSafeInteger(token.start)&&token.start>=0&&token.start<=999999999?token.start:1;
          result.push(element(token.ordered?'ol':'ul',tokens(token.items,depth+1),{start}));break;
        }
        case 'list_item':result.push(element('li',children()));break;
        case 'checkbox':result.push(token.checked?'☑ ':'☐ ');break;
        case 'table':{
          const row=(cells,header)=>element('tr',cells.map(cell=>{
            if(--remaining<0)throw Error('formatLimit');
            return element(header?'th':'td',tokens(cell.tokens,depth+1),{align:['left','center','right'].includes(cell.align)?cell.align:''});
          }));
          result.push(element('div',[element('table',[
            element('thead',[row(token.header,true)]),element('tbody',token.rows.map(cells=>row(cells,false)))
          ])]));break;
        }
        case 'link':{
          const label=children();result.push(...label);
          // Retain destinations for reading/copying, but never make links live.
          if(token.href!==token.text)result.push(' ('+token.href+')');break;
        }
        case 'image':case 'html':default:result.push(literal(token.raw||token.text||''));
      }
    }
    return result;
  }
  try{return tokens(Lexer.lex(text,{gfm:true,breaks:true}));}
  catch{return [literal(text)];}
}

function reconcile(parent,parts) {
  const document=parent.ownerDocument;
  parts.forEach((part,index)=>{
    let node=parent.childNodes[index];
    if(typeof part==='string'){
      if(node?.nodeType!==3){const next=document.createTextNode(part);if(node)node.replaceWith(next);else parent.append(next);}
      else if(node.data!==part){
        let shared=0;while(shared<node.length&&shared<part.length&&node.data[shared]===part[shared])shared++;
        node.replaceData(shared,node.length-shared,part.slice(shared));
      }
      return;
    }
    if(node?.localName!==part.tag){const next=document.createElement(part.tag);if(node)node.replaceWith(next);else parent.append(next);node=next;}
    if(part.tag==='ol'&&node.start!==part.start)node.start=part.start;
    if((part.tag==='th'||part.tag==='td')&&node.style.textAlign!==part.align)node.style.textAlign=part.align;
    if(part.tag==='th')node.scope='col';
    const className=part.tag==='div'?'ai-table':part.literal?'ai-literal':'';
    if(node.className!==className)node.className=className;
    reconcile(node,part.children);
  });
  while(parent.childNodes.length>parts.length)parent.lastChild.remove();
}
export function renderAiAnswer(node,text) {reconcile(node,aiAnswerTree(text));}
