import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const exe = process.argv[2]
if (!exe) throw Error('Usage: node scripts/verify-outline.mjs <executable> [app-path]')
const profile = await mkdtemp(join(tmpdir(), 'valence-outline-'))
const fixture = join(profile, 'outline-check.md')
const marker = 'Last outline heading'
const text = '# Outline check\n\n' + Array.from({length:80},(_,i)=>'## Heading '+(i+1)+'\n\nParagraph text.\n\n').join('')+'## Last outline heading\n\nFinal paragraph.\n'
await writeFile(fixture, text)
await writeFile(join(profile, 'valence.settings'), JSON.stringify({tabBar:'top',restoreSession:false,showInspector:false,showLineNumbers:true}))
const freePort = () => new Promise(resolve => {const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})
let port = await freePort()
let child = spawn(exe, [...process.argv.slice(3), '--remote-debugging-port='+port, '--user-data-dir='+profile, '--no-sandbox', fixture], {stdio:['ignore','pipe','pipe'], windowsHide:true})
let stderr='';child.stderr.on('data',d=>{stderr+=d});child.stdout.on('data',()=>{})
const delay=ms=>new Promise(r=>setTimeout(r,ms))
let socket
try {
  let page
  for(let i=0;i<60;i++){try{const list=await(await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(1500)})).json();page=list.find(p=>p.type==='page'&&p.webSocketDebuggerUrl&&p.url.startsWith('file:'));if(page)break}catch{}await delay(500)}
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
    const r=await fn(label=>{const e=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);if(!e)throw Error('Missing '+label);e.scrollIntoView({block:'nearest',inline:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}},label)
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...r})
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...r})
    await delay(80)
  }
  const outline=()=>fn(()=>{
    const nav=document.querySelector('nav[aria-label="Document outline"]')
    const aside=nav?.closest('aside'), body=aside?.querySelector('header')?.nextElementSibling
    if(!aside||!body)return null
    const panel=aside.getBoundingClientRect(),main=document.querySelector('main').getBoundingClientRect()
    const last=nav.lastElementChild.getBoundingClientRect(),bounds=body.getBoundingClientRect()
    return {side:panel.right<=main.left+2?'left':panel.left>=main.right-2?'right':'overlap',client:body.clientHeight,scroll:body.scrollHeight,top:body.scrollTop,bottom:bounds.bottom,lastBottom:last.bottom,asideHeight:panel.height,wrapperHeight:aside.parentElement.clientHeight,x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2}
  })
  for(const [width,height]of [[1600,1000],[700,600]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false})
    for(const side of ['left','right']) {
      const initial=await outline()
      if(initial.side!==side)await click(side==='right'?'Dock right':'Dock left')
      await until(async()=> (await outline())?.side===side)
      const bounds=await outline()
      check(bounds.client>100&&bounds.client<height&&bounds.scroll>bounds.client&&bounds.asideHeight<=bounds.wrapperHeight+2,'outline is height-constrained and scrollable: '+side+' '+width)
      await fn(()=>document.querySelector('nav[aria-label="Document outline"]').closest('aside').querySelector('header').nextElementSibling.scrollTop=0)
      await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:bounds.x,y:bounds.y})
      await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:bounds.x,y:bounds.y,deltaX:0,deltaY:bounds.scroll})
      await until(async()=>{const b=await outline();return b.top>0&&b.lastBottom<=b.bottom+2})
      check(true,'mouse wheel reaches last outline heading: '+side+' '+width)
      const r=await fn(()=>{const a=document.querySelector('nav[aria-label="Document outline"]').lastElementChild,r=a.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})
      await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...r})
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,...r})
      await until(()=>fn(()=>{const h=[...document.querySelectorAll('.ProseMirror h2')].at(-1),r=h.getBoundingClientRect(),p=h.closest('.overflow-y-auto').getBoundingClientRect();return r.top>=p.top-2&&r.bottom<=p.bottom+2}))
      check(true,'last outline heading navigates editor: '+side+' '+width)
      if(width===1600) {
        const before=await fn(()=>{const d=document.querySelector('[aria-label="Resize navigation panel"]'),r=d.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,value:Number(d.getAttribute('aria-valuenow'))}})
        const delta=side==='left'?24:-24
        await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:before.x,y:before.y})
        await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,x:before.x,y:before.y})
        await delay(80)
        await send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:before.x+delta,y:before.y})
        await delay(80)
        await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',buttons:0,clickCount:1,x:before.x+delta,y:before.y})
        await until(()=>fn(()=>Number(document.querySelector('[aria-label="Resize navigation panel"]').getAttribute('aria-valuenow'))).then(value=>value>before.value))
        check(true,'outline divider resizes in correct direction: '+side)
      }
    }
  }
  await until(async()=>JSON.parse(await readFile(join(profile,'valence.settings'),'utf8')).outlineSide==='right')
  check(true,'right dock preference is saved to settings')
  await click('Dock left');await until(async()=> (await outline())?.side==='left')
  check(true,'outline docks back to left')

} catch(error) {console.error(error);process.exitCode=1}
finally {
  socket?.close()
  if(process.platform==='win32')spawnSync('taskkill',['/F','/T','/PID',String(child.pid)],{stdio:'ignore',windowsHide:true,timeout:10000})
  else child.kill()
  await delay(300)
  await rm(profile,{recursive:true,force:true}).catch(()=>{})
  process.exit(process.exitCode ?? 0)
}
