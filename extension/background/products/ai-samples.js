function wait(signal){
  return new Promise((resolve,reject)=>{
    signal.throwIfAborted();
    const timer=setTimeout(done,25);
    function done(){signal.removeEventListener('abort',abort);resolve();}
    function abort(){clearTimeout(timer);signal.removeEventListener('abort',abort);reject(signal.reason);}
    signal.addEventListener('abort',abort,{once:true});
  });
}
export function sampleExplanation(request,language='auto'){
  const zh=(language==='auto'?request.locale:language)==='zh-CN';
  const turn=request.history.filter(message=>message.role==='assistant').length;
  if(!request.question)return zh?[
    '## 本地测试示例','',
    '这是一段用于测试侧栏的**示例解释**，不是 AI 对选中文字生成的回答。没有读取 API 密钥，也没有发送 API 请求。','',
    '您可以检查**粗体**、*斜体*、***粗斜体***和~~删除线~~的显示。','',
    '1. 列表从正文左边缘开始，不额外缩进。',
    '2. 较长的句子会在侧栏内自然换行，便于检查小窗口中的阅读效果。','',
    '> 引用也与正文对齐，不挤占文字的横向空间。','',
    '可以继续追问查看其他示例。追问包含 code 或“代码”时展示代码，包含 table 或“表格”时展示表格。'
  ].join('\n'):[
    '## A local test explanation','',
    'This is a **sample explanation** for testing the panel, not an AI answer about your selection. No API key was read and no API request was sent.','',
    'Check **bold**, *italic*, ***both*** and ~~strikethrough~~ formatting.','',
    '1. Lists start at the content edge, without extra indentation.',
    '2. Longer sentences wrap within the narrow panel so you can check how comfortably the explanation reads.','',
    '> Quotes stay aligned with the main text rather than squeezing its width.','',
    'Ask a follow-up for another example. Include code for a code example, or table for a table example.'
  ].join('\n');
  const code=/\bcode\b|代码/i.test(request.question),table=/\btables?\b|表格/i.test(request.question);
  const examples=zh?[
    '把一个复杂概念拆成**几个小步骤**，就更容易理解。先确认目标，再查看输入和输出，最后用熟悉的例子验证理解。',
    '可以把它类比为**图书馆的索引**：不必重新阅读所有内容，也能找到相关的信息。这只是本地演示用的比喻。',
    '换一个角度，先问“它解决了什么问题”，再问“在什么情况下有用”。*理解原因*往往比记住定义更重要。'
  ]:[
    'Break a difficult idea into **small steps**: identify the goal, look at its inputs and outputs, then check your understanding with a familiar example.',
    'Think of a **library index**: it helps you find relevant information without reading everything again. This analogy is a local demonstration, not an answer about your document.',
    'Try another angle: ask what problem it solves, then when it is useful. *Understanding why* often matters more than memorizing a definition.'
  ];
  const parts=[zh?'## 追问示例 '+turn:'## Follow-up example '+turn,'',examples[(Math.max(1,turn)-1)%examples.length]];
  if(code)parts.push('',zh?'### 代码示例':'### Code example','','```js','function explainTopic(topic) {','  return `A simple explanation of ${topic}`;','}','```','',zh?'代码仅用于显示测试，不会执行。':'This code is displayed only; it is never executed.');
  if(table)parts.push('',zh?'### 表格示例':'### Table example','',...(zh?[
    '| 项目 | 作用 |','| --- | --- |','| **阅读** | 查看内容并理解概念 |','| **追问** | 从另一个角度继续了解 |'
  ]:[
    '| Item | Purpose |','| --- | --- |','| **Reading** | Understand the material |','| **Follow-up** | Explore another angle |'
  ]));
  parts.push('',zh?'*本地测试模式：未调用 AI 服务。*':'*Local test mode: no AI service was called.*');
  return parts.join('\n');
}
export async function streamSampleExplanation(request,language,{signal,onText,pause=wait}){
  const answer=sampleExplanation(request,language);
  for(let offset=0;offset<answer.length;offset+=36){
    await pause(signal);signal.throwIfAborted();onText(answer.slice(offset,offset+36));
  }
  return answer;
}
