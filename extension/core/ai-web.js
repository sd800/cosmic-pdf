import { normalizeAiRequest, explanationMessages } from './ai.js';
export const AI_WEBSITES = Object.freeze({
  chatgpt:Object.freeze({label:'ChatGPT',url:'https://chatgpt.com/'}),
  claude:Object.freeze({label:'Claude',url:'https://claude.ai/new'})
});
// Conservative handoff budget, not a claim about either website's maximum.
export const AI_WEB_URL_LIMIT = 12000;
export function webExplanation(input, language, website) {
  if(!Object.hasOwn(AI_WEBSITES,website))throw Error('invalidRequest');
  const request=normalizeAiRequest(input);
  if(request.history.length||request.question.trim())throw Error('invalidRequest');
  const prompt=explanationMessages(request,language,{website:true});
  // A web link carries one ordinary question, not an API system-role message.
  const question=prompt.system+'\n\n'+prompt.messages[0].content;
  const url=new URL(AI_WEBSITES[website].url);url.searchParams.set('q',question);
  return {question,url:url.href.length<=AI_WEB_URL_LIMIT?url.href:null,home:AI_WEBSITES[website].url};
}
export function isAiWebsite(url) {
  try{
    const candidate=new URL(url);
    return Object.values(AI_WEBSITES).some(site=>candidate.origin===new URL(site.url).origin)&&!candidate.username&&!candidate.password;
  }catch{return false;}
}
