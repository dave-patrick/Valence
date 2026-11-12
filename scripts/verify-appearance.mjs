import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtemp, writeFile, readFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const profile = await mkdtemp(join(tmpdir(), 'valence-appearance-'))
const artifacts = resolve('artifacts/appearance')
await mkdir(artifacts, { recursive: true })
const fixture = join(profile, 'Workspace.md')
await writeFile(fixture, '# A clearer place to write\n\nKeep your ideas in focus. The workspace gives each part of the editor its own space, with familiar controls and a quieter frame.\n\n## One workspace, your colors\n\nChoose a starting point, then adjust the surfaces, text and spacing to make it yours.\n\n### Small details, less friction\n\n- Navigate the outline on either side.\n- Keep your documents and settings local.\n- Find what you need without leaving the editor.\n\n## Next steps\n\nThe document stays at the center of the workspace.\n')
await writeFile(join(profile, 'valence.settings'), JSON.stringify({ theme:'dark', tabBar:'top', showInspector:false, restoreSession:false, outlineSide:'right' }))
const port = await new Promise(r => { const s=createServer(); s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p))}) })
const exe = process.argv[2] ?? resolve('node_modules/electron/dist/electron.exe')
const args = process.argv[2] ? [] : ['.']
const child=spawn(exe,[...args,'--remote-debugging-port='+port,'--user-data-dir='+profile,fixture],{stdio:['ignore','pipe','pipe'],windowsHide:true})
let stderr=''; child.stderr.on('data',d=>stderr+=d);child.stdout.on('data',()=>{})
const delay=ms=>new Promise(r=>setTimeout(r,ms))
let socket
try {
 let page
 for(let i=0;i<100;i++){try{page=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(p=>p.type==='page'&&p.url.startsWith('file:'));if(page)break}catch{}await delay(250)}
 if(!page)throw Error('App did not launch: '+stderr.slice(0,500))
 socket=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>socket.addEventListener('open',r,{once:true}))
 let id=0;const pending=new Map();socket.addEventListener('message',e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}})
 const send=(method,params={})=>new Promise((r,j)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);j(Error('CDP timed out '+method))},30000);pending.set(n,m=>{clearTimeout(timer);m.error?j(Error(JSON.stringify(m.error))):r(m.result)});socket.send(JSON.stringify({id:n,method,params}))})
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result?.value}
 const fn=(callback,arg)=>evaluate('('+callback.toString()+')('+JSON.stringify(arg)+')')
 const check=(ok,msg)=>{if(!ok)throw Error(msg);console.log('PASS '+msg)}
 const until=async callback=>{for(let i=0;i<160;i++){if(await callback())return;await delay(150)}throw Error('UI did not settle')}
 const click=label=>fn(label=>{const b=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===label||b.textContent.trim()===label);if(!b)throw Error('Missing '+label);b.click()},label)
 const select=(label,value)=>fn(({label,value})=>{const e=document.querySelector('select[aria-label="'+label+'"]');e.value=value;e.dispatchEvent(new Event('change',{bubbles:true}))},{label,value})
 await until(()=>fn(()=>!!document.querySelector('.ProseMirror h1')))
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false})
 await evaluate('document.fonts.ready')
 const capture=async name=>{await delay(300);const r=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(artifacts,name+'.png'),Buffer.from(r.data,'base64'))}
 await capture('dark-workspace')
 await click('Settings')
 await select('Color mode','light')
 await until(()=>fn(()=>document.documentElement.dataset.theme==='light'))
 await click('Close settings');await capture('light-workspace')
 await click('Settings');await select('Appearance preset','forest')
 await until(()=>fn(()=>document.documentElement.style.getPropertyValue('--bg')==='#0f1a14'))
 await fn(()=>{const e=document.querySelector('[aria-label="Window padding"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'16');e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))})
 await until(()=>fn(()=>document.documentElement.style.getPropertyValue('--workspace-gap')==='16px'))
 await select('Interface font','Georgia')
 check(await fn(()=>document.documentElement.style.getPropertyValue('--font-body').includes('Georgia')),'font override applies')
 await capture('appearance-settings')
 await click('Reset appearance')
 await until(()=>fn(()=>!document.documentElement.style.getPropertyValue('--font-body')))
 check(await fn(()=>document.documentElement.style.getPropertyValue('--workspace-gap')==='10px'),'reset clears overrides and spacing')
 await select('Color mode','dark');await click('Close settings')
 await send('Emulation.setDeviceMetricsOverride',{width:700,height:600,deviceScaleFactor:1,mobile:false})
 await capture('narrow-workspace')
 check(await fn(()=>{const m=document.querySelector('main').getBoundingClientRect();return m.width>=240&&m.height>300}),'narrow editor remains usable')
 await click('Dock left');await click('Dock right')
 check(await fn(()=>!!document.querySelector('[aria-label="Move outline to left"]')),'outline docks both ways')
 const saved=JSON.parse(await readFile(join(profile,'valence.settings'),'utf8'))
 check(saved.look.spacing===10&&saved.theme==='dark','appearance persists to local settings')
 console.log('Screenshots: '+artifacts)
 await send('Browser.close').catch(()=>{})
} finally {socket?.close();if(child.exitCode===null)child.kill()}
