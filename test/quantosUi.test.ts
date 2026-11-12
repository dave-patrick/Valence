/** @vitest-environment jsdom */
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { App } from '../src/renderer/src/App'
import { DEFAULT_SETTINGS, normaliseSettings } from '../src/core/settings'
import { setPlatform } from '../src/platform'
import { createWebPlatform } from '../src/platform/web'
import type { QuantosMoveRequest, QuantosMoveResult } from '../src/core/quantos'
let root: Root | undefined
beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe(){} unobserve(){} disconnect(){} }
  Element.prototype.scrollIntoView ??= function(){}
  Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect ??= () => new DOMRect()
  window.matchMedia ??= (() => ({matches:false,addEventListener(){},removeEventListener(){}})) as never
})
afterEach(() => { root?.unmount(); root=undefined; document.body.innerHTML=''; vi.restoreAllMocks() })
async function until(check:()=>unknown) { for(let i=0;i<400;i++){if(check())return;await new Promise(r=>setTimeout(r,10))}throw Error('UI did not settle') }
const click=(el:Element|null)=>{if(!el)throw Error('Missing button');el.dispatchEvent(new MouseEvent('click',{bubbles:true}))}
const button=(label:string)=>[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()===label)??null
const textarea=()=>document.querySelector('textarea[data-view=source]') as HTMLTextAreaElement
function type(text:string){Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(textarea(),text);textarea().dispatchEvent(new Event('input',{bubbles:true}))}
async function mount(configured=true) {
  localStorage.clear();const platform=createWebPlatform()
  await platform.fs.write('/notes/first.txt','original')
  await platform.fs.write('valence.settings',JSON.stringify({...DEFAULT_SETTINGS,quantosVault:configured?'/vault':'',lastSession:['/notes/first.txt']}))
  setPlatform(platform);const host=document.createElement('div');document.body.append(host);root=createRoot(host);root.render(createElement(App))
  await until(()=>textarea());return platform
}
it('normalizes Quantos settings without guessing a vault',()=>{
  expect(normaliseSettings({}).quantosVault).toBe('')
  expect(normaliseSettings({quantosWorkspace:'../escape',quantosShowInHeader:false})).toMatchObject({quantosWorkspace:'default',quantosShowInHeader:false})
})
it('header plus keeps unsaved text in the previous document',async()=>{
  await mount();type('unsaved original')
  await until(()=>textarea().value==='unsaved original')
  click(document.querySelector('[aria-label="New document"]'))
  await until(()=>document.querySelectorAll('[role=tab]').length===2)
  expect(document.querySelector('[role=tab][aria-selected=true]')?.textContent).toContain('Untitled')
  click(document.querySelector('[role=tab][title="/notes/first.txt"]'))
  await until(()=>textarea()?.value==='unsaved original')
})
it('moves the current snapshot, locks saves and retargets the same tab',async()=>{
  const platform=await mount()
  let complete!: (value:QuantosMoveResult)=>void
  const send=vi.fn((request:QuantosMoveRequest)=>new Promise<QuantosMoveResult>(resolve=>{complete=resolve}))
  platform.quantos={inspect:async()=>['default'],send}
  type('new unsaved words')
  await until(()=>textarea().value==='new unsaved words')
  click(document.querySelector('[aria-label="Move to Quantos vault"]'))
  await until(()=>send.mock.calls.length===1&&textarea().readOnly)
  expect(send.mock.calls[0][0]).toMatchObject({path:'/notes/first.txt',source:'new unsaved words',saved:'original',workspace:'default'})
  window.dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true,cancelable:true}))
  await new Promise(r=>setTimeout(r,20))
  expect(await platform.fs.read('/notes/first.txt')).toBe('original')
  const content='# first\n\n```txt\nnew unsaved words\n```\n'
  await platform.fs.write('/vault/workspaces/default/nodes/first.md',content)
  complete({path:'/vault/workspaces/default/nodes/first.md',content,recoveryPath:'/notes/.backup'})
  await until(()=>document.querySelector('[role=tab][title="/vault/workspaces/default/nodes/first.md"]'))
  expect(document.querySelectorAll('[role=tab]')).toHaveLength(1)
  click(button('Source'))
  await until(()=>textarea())
  expect(textarea()?.value).toBe(content)
  expect(textarea()?.readOnly).toBe(false)
  expect(document.querySelector('.valence-status')?.textContent).toContain('All changes saved')
})
it('shows move errors without changing the document and keeps header visibility configurable',async()=>{
  const platform=await mount()
  platform.quantos={inspect:async()=>['default'],send:vi.fn(async()=>{throw Error('Destination unavailable')})}
  click(document.querySelector('[aria-label="Move to Quantos vault"]'))
  await until(()=>document.querySelector('[role=status]')?.textContent?.includes('Destination unavailable'))
  expect(document.querySelector('[role=tab][title="/notes/first.txt"]')).not.toBeNull()
  expect(textarea().readOnly).toBe(false)
  click(document.querySelector('[aria-label="Settings"]'))
  await until(()=>document.querySelector('#quantos-settings'))
  const toggle=document.querySelector('#quantos-settings input[type=checkbox]')!
  click(toggle)
  await until(()=>!document.querySelector('[aria-label="Move to Quantos vault"]'))
  expect(JSON.parse(await platform.fs.read('valence.settings')).quantosShowInHeader).toBe(false)
})
