import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const exe = process.argv[2]
if (!exe) throw Error('Usage: node scripts/verify-find.mjs <executable> [app-path]')
const profile = await mkdtemp(join(tmpdir(), 'valence-find-'))
const fixture = join(profile, 'find-check.md')
const marker = 'Find check'
const text = '# Find check\r\n\r\nA **cat** and cat.\r\n\r\nLiteral $1* and catfish.\r\n'
await writeFile(fixture, text)
await writeFile(join(profile, 'valence.settings'), JSON.stringify({tabBar:'left',restoreSession:false,showInspector:true,showLineNumbers:true}))
const port = await new Promise(resolve => {const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})
const child = spawn(exe, [...process.argv.slice(3), '--remote-debugging-port='+port, '--user-data-dir='+profile, '--no-sandbox', fixture], {stdio:['ignore','pipe','pipe'], windowsHide:true})
let stderr='';child.stderr.on('data',d=>{stderr+=d});child.stdout.on('data',()=>{})
const delay=ms=>new Promise(r=>setTimeout(r,ms))
let socket
try {
  let page
  for(let i=0;i<60;i++){try{const list=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();page=list.find(p=>p.type==='page'&&p.webSocketDebuggerUrl&&p.url.startsWith('file:'));if(page)break}catch{}await delay(500)}
  if(!page)throw Error('Editor did not open: '+stderr.slice(0,500))
  socket=new WebSocket(page.webSocketDebuggerUrl)
  await new Promise(r=>socket.addEventListener('open',r,{once:true}))
  let next=0;const waiting=new Map()
  socket.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(waiting.has(msg.id)){waiting.get(msg.id)(msg);waiting.delete(msg.id)}})
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;const timer=setTimeout(()=>{waiting.delete(id);reject(Error('CDP timeout: '+method))},20000);waiting.set(id,msg=>{clearTimeout(timer);msg.error?reject(Error(JSON.stringify(msg.error))):resolve(msg.result)});socket.send(JSON.stringify({id,method,params}))})
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value}
  for(let i=0;i<120;i++){if(await evaluate('document.querySelector(".ProseMirror")?.textContent.includes('+JSON.stringify(marker)+')'))break;await delay(250)}
  if(!await evaluate('document.querySelector(".ProseMirror")?.textContent.includes('+JSON.stringify(marker)+')'))throw Error('Long fixture did not load')
  await delay(700)

  const fn=(callback,arg)=>evaluate('('+callback.toString()+')('+JSON.stringify(arg)+')')
  const check=(condition,message)=>{if(!condition)throw Error('FAIL '+message);console.log('PASS '+message)}
  const until=async(callback)=>{for(let i=0;i<100;i++){if(await callback())return;await delay(50)}throw Error('UI condition did not settle')}
  const press=async(key,modifiers=2)=>{
    const code=key.length===1?'Key'+key.toUpperCase():key
    const vk=key==='Escape'?27:key==='Enter'?13:key.toUpperCase().charCodeAt(0)
    const actual=key.length===1&&(modifiers&8)?key.toUpperCase():key
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:actual,code,windowsVirtualKeyCode:vk,modifiers})
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:actual,code,windowsVirtualKeyCode:vk,modifiers})
    await delay(60)
  }
  const click=async(label)=>{
    const r=await fn(label=>{const e=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);if(!e)throw Error('Missing '+label);const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}},label)
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...r})
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...r})
    await delay(80)
  }
  const field=async(index,value)=>{await fn(i=>document.querySelectorAll('.valence-find input')[i].focus(),index);await press('a');await send('Input.insertText',{text:value});await delay(80)}
  const count=()=>fn(()=>document.querySelector('.valence-find__count')?.textContent)
  await send('Emulation.setDeviceMetricsOverride',{width:1400,height:900,deviceScaleFactor:1,mobile:false})
  await press('f');await until(()=>fn(()=>!!document.querySelector('.valence-find')))
  await field(0,'cat');await until(async()=>await count()==='1 of 3');check(true,'Ctrl+F opens Find with all visible matches')
  await press('Enter',0);check(await count()==='2 of 3','Enter moves to the next match')
  await press('Enter',8);check(await count()==='1 of 3','Shift+Enter moves to the previous match')
  await click('Whole word');await until(async()=>await count()==='1 of 2');check(true,'whole-word search excludes catfish')
  await field(0,'CAT');await click('Match case');await until(async()=>await count()==='No matches');check(true,'case-sensitive search reports no matches')
  await click('Match case');await field(0,'cat')
  await press('h');await until(()=>fn(()=>document.querySelectorAll('.valence-find input').length===2))
  await field(1,'dog');await click('Replace all')
  await until(()=>fn(()=>document.querySelector('.ProseMirror strong')?.textContent==='dog'))
  check(await fn(()=>document.querySelector('.ProseMirror').textContent.includes('catfish')),'Replace All keeps whole-word boundaries and bold formatting')
  await fn(()=>document.querySelector('.ProseMirror').focus());await press('z')
  await until(()=>fn(()=>document.querySelector('.ProseMirror strong')?.textContent==='cat'));check(true,'rich Replace All undoes in one step')
  if(process.env.VALENCE_FIND_SCREENSHOT){const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(process.env.VALENCE_FIND_SCREENSHOT,Buffer.from(shot.data,'base64'))}
  await delay(400);await click('Source');await until(()=>fn(()=>!!document.querySelector('textarea[data-view=source]')))
  const original=await fn(()=>document.querySelector('textarea[data-view=source]').value)
  const expected=original.replace(/\bcat\b/g,()=>'$1*')
  await field(1,'$1*');await click('Replace all')
  await until(()=>fn(()=>document.querySelector('textarea[data-view=source]').value).then(value=>value===expected))
  check(true,'source replacement treats dollar signs and Markdown characters literally')
  await press('s')
  for(let i=0;i<80;i++){if(await (await import('node:fs/promises')).readFile(fixture,'utf8')===expected.replace(/\n/g,'\r\n'))break;await delay(50)}
  check(await (await import('node:fs/promises')).readFile(fixture,'utf8')===expected.replace(/\n/g,'\r\n'),'saving immediately preserves replacements and CRLF line endings')
  await fn(()=>document.querySelector('textarea[data-view=source]').focus());await press('z')
  await until(()=>fn(()=>document.querySelector('textarea[data-view=source]').value).then(value=>value===original));check(true,'Source Undo restores Replace All in one step')
  await press('y')
  await until(()=>fn(()=>document.querySelector('textarea[data-view=source]').value).then(value=>value===expected));check(true,'Source Redo restores replacement')
  await press('Escape',0);await until(()=>fn(()=>!document.querySelector('.valence-find')));check(true,'Escape closes Find from the editor')
  check(await fn(()=>{const w=document.querySelector('main').parentElement;return w.scrollHeight<=w.clientHeight+2}),'Find toolbar preserves scroll containment')

} catch(error) {console.error(error);process.exitCode=1}
finally {
  socket?.close()
  if(process.platform==='win32')spawnSync('taskkill',['/F','/T','/PID',String(child.pid)],{stdio:'ignore',windowsHide:true})
  else child.kill()
  await delay(300)
  await rm(profile,{recursive:true,force:true}).catch(()=>{})
  process.exit(process.exitCode ?? 0)
}
