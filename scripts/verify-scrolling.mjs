import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const exe = process.argv[2]
if (!exe) throw Error('Usage: node scripts/verify-scrolling.mjs <executable> [app-path]')
const profile = await mkdtemp(join(tmpdir(), 'valence-scroll-'))
const fixture = join(profile, 'long-scroll-check.md')
const marker = 'END OF SCROLL CHECK'
const text = '# Long scroll check\n\n' + Array.from({ length: 80 }, (_, i) =>
  (i < Number(process.env.VALENCE_SCROLL_HEADINGS ?? 80) ? '## Section ' + (i + 1) + '\n\n' : '') + Array.from({ length: 5 }, () => 'This generated paragraph checks that every part of a long document remains reachable while the surrounding controls stay visible.\n\n').join('') +
  (i % 10 === 0 ? '```text\n' + 'wide_content_'.repeat(120) + '\n```\n\n' : '')
).join('') + '## ' + marker + '\n\nThe final paragraph must be reachable.\n'
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
  console.log('BEFORE', JSON.stringify(await evaluate(`(() => {const editor=document.querySelector('.ProseMirror');const rows=[];for(let e=editor;e;e=e.parentElement){const r=e.getBoundingClientRect(),s=getComputedStyle(e);rows.push({tag:e.tagName,cls:e.className,height:r.height,top:r.top,bottom:r.bottom,client:e.clientHeight,scroll:e.scrollHeight,overflow:s.overflowY,minHeight:s.minHeight})}return rows})()`)))
  const results=[]
  for(const [width,height] of [[1280,840],[1600,1000],[700,600]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false})
    await delay(150)
    for(const mode of ['Hybrid','Source','Split']) {
      await evaluate('([...document.querySelectorAll("button")].find(b=>b.textContent.trim()==='+JSON.stringify(mode)+')).click()')
      await delay(200)
      if(mode==='Split') { for(let i=0;i<120;i++){if(await evaluate('document.querySelector(".read-surface")?.textContent.includes('+JSON.stringify(marker)+')'))break;await delay(100)} }
      if(width===1600 && mode==='Hybrid') {
        const wheelTarget=await evaluate('(()=>{const t=document.querySelector(".ProseMirror").parentElement.closest(".overflow-y-auto");t.scrollTop=0;const r=t.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,delta:t.scrollHeight}})()')
        await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:wheelTarget.x,y:wheelTarget.y})
        await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:wheelTarget.x,y:wheelTarget.y,deltaX:0,deltaY:wheelTarget.delta})
        for(let i=0;i<40;i++){if(await evaluate('(()=>{const t=document.querySelector(".ProseMirror").parentElement.closest(".overflow-y-auto");return Math.abs(t.scrollHeight-t.clientHeight-t.scrollTop)<=2})()'))break;await delay(50)}
        const reached=await evaluate('(()=>{const t=document.querySelector(".ProseMirror").parentElement.closest(".overflow-y-auto");return Math.abs(t.scrollHeight-t.clientHeight-t.scrollTop)<=2})()')
        console.log(reached?'PASS':'FAIL','mouse wheel reaches document end');if(!reached)process.exitCode=1
      }
      const details=await evaluate(`(async()=>{const mode=${JSON.stringify(mode)};const root=document.getElementById('root').firstElementChild;const workspace=root.querySelector('main').parentElement;const editor=document.querySelector('.ProseMirror');const source=document.querySelector('textarea[data-view=source]');const targets=mode==='Source'?[source]:[editor.parentElement.closest('.overflow-y-auto')];if(mode==='Split')targets.push(document.querySelector('.read-surface').parentElement);const out=[];for(const target of targets){target.scrollTop=target.scrollHeight;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const r=target.getBoundingClientRect();const end=target.querySelector('h2:last-of-type');const last=target.querySelector('.ProseMirror p:last-child, .read-surface p:last-child');out.push({client:target.clientHeight,scroll:target.scrollHeight,top:r.top,bottom:r.bottom,scrollTop:target.scrollTop,lastBottom:last?.getBoundingClientRect().bottom,marker:end?.textContent,atEnd:Math.abs(target.scrollHeight-target.clientHeight-target.scrollTop)<=2,contained:r.top>=root.getBoundingClientRect().top&&r.bottom<=root.getBoundingClientRect().bottom,finalVisible:mode==='Source'?Math.abs(target.scrollHeight-target.clientHeight-target.scrollTop)<=2:!!last&&last.getBoundingClientRect().bottom<=r.bottom&&last.getBoundingClientRect().bottom>=r.top});}return {viewport:innerHeight,workspaceClient:workspace.clientHeight,workspaceScroll:workspace.scrollHeight,workspaceTop:workspace.scrollTop,rootBottom:root.getBoundingClientRect().bottom,panes:out}})()`)
      const okay=details.workspaceScroll<=details.workspaceClient+2&&details.panes.every(p=>p.client>100&&p.atEnd&&p.contained&&p.finalVisible)
      results.push({width,height,mode,okay,details});console.log(okay?'PASS':'FAIL',width+'x'+height,mode,JSON.stringify(details))
      if(process.env.VALENCE_SCROLL_SCREENSHOT && width===1600 && mode==='Hybrid') {const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(process.env.VALENCE_SCROLL_SCREENSHOT,Buffer.from(shot.data,'base64'))}
    }
  }
  const gutterReachable=await evaluate('(async()=>{const nav=document.querySelector("main [role=navigation]");const buttons=nav.querySelectorAll("button");for(const button of [buttons[buttons.length-1],buttons[0]]){button.focus();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const a=button.getBoundingClientRect(),b=nav.getBoundingClientRect();if(a.top<b.top-1||a.bottom>b.bottom+1)return false}return true})()')
  console.log(gutterReachable?'PASS':'FAIL','first and last heading controls remain reachable');if(!gutterReachable)process.exitCode=1
  if(results.some(r=>!r.okay))process.exitCode=1
} catch(error) {console.error(error);process.exitCode=1}
finally {
  socket?.close()
  if(process.platform==='win32')spawnSync('taskkill',['/F','/T','/PID',String(child.pid)],{stdio:'ignore',windowsHide:true})
  else child.kill()
  await delay(300)
  await rm(profile,{recursive:true,force:true}).catch(()=>{})
  process.exit(process.exitCode ?? 0)
}
