/** @vitest-environment jsdom */
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { App } from '../src/renderer/src/App'
import { DEFAULT_SETTINGS, normaliseSettings } from '../src/core/settings'
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
it('normalizes outline docking for old and malformed settings',()=>{
  expect(normaliseSettings({}).outlineSide).toBe('left')
  expect(normaliseSettings({outlineSide:'bottom'}).outlineSide).toBe('left')
  expect(normaliseSettings({outlineSide:'right'}).outlineSide).toBe('right')
})
it('docks only Outline, persists the choice and preserves the mounted editor',async()=>{
  const platform=await mount({'/notes/outline.md':'# First\n\n## Last\n\nText.\n'})
  await until(()=>document.querySelector('.ProseMirror h1')?.textContent==='First')
  const editor=document.querySelector('.ProseMirror'),main=document.querySelector('main')!
  const aside=()=>document.querySelector('nav[aria-label="Document outline"]')!.closest('aside')!
  const onRight=()=>!!(main.compareDocumentPosition(aside())&Node.DOCUMENT_POSITION_FOLLOWING)
  expect(onRight()).toBe(false)
  click(document.querySelector('[aria-label="Move outline to right"]'))
  await until(()=>document.querySelector('[aria-label="Move outline to left"]'))
  expect(onRight()).toBe(true)
  expect(document.querySelector('.ProseMirror')).toBe(editor)
  expect(JSON.parse(await platform.fs.read('valence.settings')).outlineSide).toBe('right')
  for(const panel of ['Files','Search']) {
    click(document.querySelector(`[aria-label="${panel}"]`))
    await until(()=>document.querySelector('aside header h2')?.textContent===panel)
    expect(!!(main.compareDocumentPosition(document.querySelector('aside')!)&Node.DOCUMENT_POSITION_PRECEDING)).toBe(true)
    expect(document.querySelector('[aria-label="Move outline to left"]')).toBeNull()
  }
  click(document.querySelector('[aria-label="Outline"]'))
  await until(()=>document.querySelector('[aria-label="Move outline to left"]'))
  expect(onRight()).toBe(true)
  expect(document.querySelector('.ProseMirror')).toBe(editor)
  root!.unmount();root=undefined;document.body.innerHTML=''
  const host=document.createElement('div');document.body.append(host);root=createRoot(host);root.render(createElement(App))
  await until(()=>document.querySelector('[aria-label="Move outline to left"]'))
  const restoredMain=document.querySelector('main')!
  expect(!!(restoredMain.compareDocumentPosition(aside())&Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
  click(document.querySelector('[aria-label="Move outline to left"]'))
  await until(()=>document.querySelector('[aria-label="Move outline to right"]'))
  expect(!!(restoredMain.compareDocumentPosition(aside())&Node.DOCUMENT_POSITION_PRECEDING)).toBe(true)
},30000)
