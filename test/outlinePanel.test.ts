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
  expect(normaliseSettings({}).sidebarSide).toBe('left')
  expect(normaliseSettings({outlineSide:'bottom'}).sidebarSide).toBe('left')
  expect(normaliseSettings({outlineSide:'right'}).sidebarSide).toBe('right')
  expect(normaliseSettings({sidebarSide:'left',outlineSide:'right'}).sidebarSide).toBe('left')
})
it('docks every panel, persists the choice and preserves the mounted editor',async()=>{
  const platform=await mount({'/notes/outline.md':'# First\n\n## Last\n\nText.\n'})
  await until(()=>document.querySelector('.ProseMirror h1')?.textContent==='First')
  const editor=document.querySelector('.ProseMirror')
  const onRight=()=>document.querySelector<HTMLElement>('.valence-workspace')?.dataset.sidebarSide==='right'
  expect(onRight()).toBe(false)
  click(document.querySelector('[aria-label="Move sidebar to right"]'))
  await until(()=>document.querySelector('[aria-label="Move sidebar to left"]'))
  expect(onRight()).toBe(true)
  expect(document.querySelector('.ProseMirror')).toBe(editor)
  expect(JSON.parse(await platform.fs.read('valence.settings')).sidebarSide).toBe('right')
  for(const panel of ['Files','Search']) {
    click(document.querySelector(`[aria-label="${panel}"]`))
    await until(()=>document.querySelector('aside header h2')?.textContent===panel)
    expect(onRight()).toBe(true)
    expect(document.querySelector('[aria-label="Move sidebar to left"]')).not.toBeNull()
  }
  click(document.querySelector('[aria-label="Outline"]'))
  await until(()=>document.querySelector('[aria-label="Move sidebar to left"]'))
  expect(onRight()).toBe(true)
  expect(document.querySelector('.ProseMirror')).toBe(editor)
  root!.unmount();root=undefined;document.body.innerHTML=''
  const host=document.createElement('div');document.body.append(host);root=createRoot(host);root.render(createElement(App))
  await until(()=>document.querySelector('[aria-label="Move sidebar to left"]'))
  expect(onRight()).toBe(true)
  click(document.querySelector('[aria-label="Move sidebar to left"]'))
  await until(()=>document.querySelector('[aria-label="Move sidebar to right"]'))
  expect(onRight()).toBe(false)
},30000)

it('offers checked docking choices from rail and header using pointer or keyboard',async()=>{
  const platform=await mount({'/notes/menu.md':'# Menu\n'})
  await until(()=>document.querySelector('.ProseMirror h1')?.textContent==='Menu')
  const outline=document.querySelector<HTMLButtonElement>('nav[aria-label="Panels"] [aria-label="Outline"]')!
  outline.focus()
  outline.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:30,clientY:60}))
  await until(()=>document.querySelector('[role="menu"]'))
  const choice=(side:string)=>[...document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')].find(el=>el.textContent?.includes(`Move sidebar ${side}`))!
  expect(choice('left').getAttribute('aria-checked')).toBe('true')
  click(choice('right'))
  await until(()=>!document.querySelector('[role="menu"]')&&document.querySelector('[aria-label="Move sidebar to left"]'))
  expect(document.activeElement).toBe(outline)
  expect(JSON.parse(await platform.fs.read('valence.settings')).sidebarSide).toBe('right')
  const dock=document.querySelector<HTMLButtonElement>('[aria-label="Move sidebar to left"]')!
  dock.focus()
  dock.dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true}))
  await until(()=>document.querySelector('[role="menu"]'))
  expect(choice('right').getAttribute('aria-checked')).toBe('true')
  choice('right').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))
  await until(()=>!document.querySelector('[role="menu"]'))
  expect(document.activeElement).toBe(dock)
  dock.dispatchEvent(new KeyboardEvent('keydown',{key:'ContextMenu',bubbles:true,cancelable:true}))
  await until(()=>document.querySelector('[role="menu"]'))
  document.body.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))
  await until(()=>!document.querySelector('[role="menu"]'))
  click(document.querySelector('[aria-label="Files"]'))
  await until(()=>document.querySelector('aside header h2')?.textContent==='Files')
  document.querySelector('aside header')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))
  await until(()=>document.querySelector('[role="menu"]'))
  click(choice('left'))
  await until(()=>document.querySelector('[aria-label="Move sidebar to right"]'))
},30000)
