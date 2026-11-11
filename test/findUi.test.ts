/** @vitest-environment jsdom */
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { App } from '../src/renderer/src/App'
import { DEFAULT_SETTINGS } from '../src/core/settings'
import { setPlatform } from '../src/platform'
import { createWebPlatform } from '../src/platform/web'
let root: Root | undefined
beforeAll(() => {
  globalThis.ResizeObserver ??= class {observe(){} unobserve(){} disconnect(){}}
  Element.prototype.scrollIntoView ??= function(){}
  Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect ??= () => new DOMRect()
  window.matchMedia ??= (()=>({matches:false,addEventListener(){},removeEventListener(){}})) as never
})
afterEach(()=>{root?.unmount();root=undefined;document.body.innerHTML='';vi.restoreAllMocks();Reflect.deleteProperty(document,'execCommand')})
async function until(check:()=>unknown){for(let i=0;i<400;i++){if(check())return;await new Promise(r=>setTimeout(r,20))}throw Error('UI did not settle')}
const click=(el:Element|null)=>{if(!el)throw Error('Missing button');el.dispatchEvent(new MouseEvent('click',{bubbles:true}))}
const button=(label:string)=>[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()===label)??null
const key=(key:string,altKey=false)=>document.dispatchEvent(new KeyboardEvent('keydown',{key,ctrlKey:true,altKey,bubbles:true,cancelable:true}))
function input(el:HTMLInputElement,text:string){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,text);el.dispatchEvent(new Event('input',{bubbles:true}))}
async function mount(files:Record<string,string>){
  localStorage.clear();const platform=createWebPlatform()
  for(const [path,text]of Object.entries(files))await platform.fs.write(path,text)
  await platform.fs.write('valence.settings',JSON.stringify({...DEFAULT_SETTINGS,lastSession:Object.keys(files)}))
  setPlatform(platform);const host=document.createElement('div');document.body.append(host);root=createRoot(host);root.render(createElement(App))
  await until(()=>document.querySelector('[role=tab]'));click(document.querySelector('[role=tab]'))
  return platform
}
it('finds and replaces formatted text, navigates matches and isolates tabs',async()=>{
  const platform=await mount({'/notes/first.md':'# Cat\n\nA **cat** and cat.\n','/notes/other.md':'# Other\n\nUntouched.\n'})
  await until(()=>document.querySelector('.ProseMirror h1')?.textContent==='Cat')
  key('f');await until(()=>document.querySelector('[aria-label="Find and replace"]'))
  const query=document.querySelector('.valence-find input')! as HTMLInputElement
  input(query,'cat');await until(()=>document.querySelector('.valence-find__count')?.textContent==='1 of 3')
  const composingEnter=new KeyboardEvent('keydown',{key:'Enter',isComposing:true,keyCode:229,bubbles:true,cancelable:true})
  query.dispatchEvent(composingEnter)
  expect(composingEnter.defaultPrevented).toBe(false)
  expect(document.querySelector('.valence-find__count')?.textContent).toBe('1 of 3')
  click(button('Next'));await until(()=>document.querySelector('.valence-find__count')?.textContent==='2 of 3')
  click(button('Match case'));await until(()=>document.querySelector('.valence-find__count')?.textContent==='1 of 2')
  key('h');await until(()=>document.querySelectorAll('.valence-find input').length===2)
  input(document.querySelectorAll('.valence-find input')[1] as HTMLInputElement,'dog')
  click(button('Replace all'));await until(()=>document.querySelector('.ProseMirror strong')?.textContent==='dog')
  expect(document.querySelector('.ProseMirror h1')?.textContent).toBe('Cat')
  click(document.querySelector('[role=tab][title="/notes/other.md"]'))
  await until(()=>document.querySelector('.ProseMirror h1')?.textContent==='Other')
  await until(()=>document.querySelector('.valence-find__count')?.textContent==='No matches')
  expect(button('Replace all')?.hasAttribute('disabled')).toBe(true)
  expect(await platform.fs.read('/notes/other.md')).toBe('# Other\n\nUntouched.\n')
  click(document.querySelector('[aria-label="Close find"]'));await until(()=>!document.querySelector('.valence-find'))
},30000)
it('replaces normalized source literally and saves original CRLF endings',async()=>{
  const platform=await mount({'/notes/file.txt':'cat\r\ncat\r\n$cat\r\n'})
  await until(()=>document.querySelector('textarea[data-view=source]'))
  key('h');await until(()=>document.querySelectorAll('.valence-find input').length===2)
  input(document.querySelector('.valence-find input') as HTMLInputElement,'cat')
  input(document.querySelectorAll('.valence-find input')[1] as HTMLInputElement,'$1*')
  await until(()=>document.querySelector('.valence-find__count')?.textContent==='1 of 3')
  click(button('Replace all'));await until(()=>(document.querySelector('textarea[data-view=source]') as HTMLTextAreaElement).value==='$1*\n$1*\n$$1*\n')
  key('s');await until(()=>document.body.textContent?.includes('All changes saved'))
  expect(await platform.fs.read('/notes/file.txt')).toBe('$1*\r\n$1*\r\n$$1*\r\n')
},30000)

it('keeps Source undo and redo isolated per document and routes native history',async()=>{
  await mount({'/notes/first.txt':'cat','/notes/other.txt':'other'})
  await until(()=>document.querySelector('textarea[data-view=source]'))
  const textarea=()=>document.querySelector('textarea[data-view=source]') as HTMLTextAreaElement
  const edit=(text:string)=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(textarea(),text);textarea().dispatchEvent(new Event('input',{bubbles:true}))}
  const history=(key:string,shiftKey=false)=>textarea().dispatchEvent(new KeyboardEvent('keydown',{key,ctrlKey:true,shiftKey,bubbles:true,cancelable:true}))
  edit('cat typed');await until(()=>textarea().value==='cat typed')
  key('h');await until(()=>document.querySelectorAll('.valence-find input').length===2)
  input(document.querySelector('.valence-find input') as HTMLInputElement,'cat')
  input(document.querySelectorAll('.valence-find input')[1] as HTMLInputElement,'dog')
  await until(()=>document.querySelector('.valence-find__count')?.textContent==='1 of 1')
  click(button('Replace all'));await until(()=>textarea().value==='dog typed')
  history('z');await until(()=>textarea().value==='cat typed')
  history('y');await until(()=>textarea().value==='dog typed')
  edit('dog typed!');await until(()=>textarea().value==='dog typed!')
  textarea().dispatchEvent(new InputEvent('beforeinput',{inputType:'historyUndo',bubbles:true,cancelable:true}))
  await until(()=>textarea().value==='dog typed')
  // A noncancelable native history input must restore the authoritative custom result.
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(textarea(),'browser wrong')
  textarea().dispatchEvent(new InputEvent('input',{inputType:'historyUndo',bubbles:true}))
  await until(()=>textarea().value==='cat typed')
  click(document.querySelector('[role=tab][title="/notes/other.txt"]'))
  await until(()=>textarea().value==='other')
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(textarea(),'native wrong')
  textarea().dispatchEvent(new InputEvent('input',{inputType:'historyUndo',bubbles:true}))
  await until(()=>textarea().value==='other')
  click(document.querySelector('[role=tab][title="/notes/first.txt"]'))
  await until(()=>textarea().value==='cat typed')
  history('y');await until(()=>textarea().value==='dog typed')
},30000)

it('groups Source composition and ignores history shortcuts during IME input',async()=>{
  await mount({'/notes/ime.txt':'cat'})
  await until(()=>document.querySelector('textarea[data-view=source]'))
  const t=document.querySelector('textarea[data-view=source]') as HTMLTextAreaElement
  const edit=(text:string)=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(t,text);t.dispatchEvent(new Event('input',{bubbles:true}))}
  t.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}))
  edit('cat n');await until(()=>t.value==='cat n')
  t.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,keyCode:229,bubbles:true,cancelable:true}))
  expect(t.value).toBe('cat n')
  edit('cat 你');await until(()=>t.value==='cat 你')
  t.dispatchEvent(new InputEvent('beforeinput',{inputType:'historyUndo',bubbles:true,cancelable:true,isComposing:false}))
  expect(t.value).toBe('cat 你')
  t.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}))
  await new Promise(r=>setTimeout(r,10))
  t.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}))
  await until(()=>t.value==='cat')
  t.dispatchEvent(new KeyboardEvent('keydown',{key:'y',ctrlKey:true,bubbles:true,cancelable:true}))
  await until(()=>t.value==='cat 你')
},30000)
