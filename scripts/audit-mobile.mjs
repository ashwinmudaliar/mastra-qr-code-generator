import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { archiveVerificationCode } from './archive-verification-code.mjs';
const base='http://127.0.0.1:3147';
const dir=new URL('../outputs/mobile-readability/',import.meta.url).pathname;
await fs.mkdir(dir,{recursive:true});
// Phones get the 44px touch-target check; laptop and desktop share the text, contrast and overflow checks.
const PHONES=[320,360,390,430];const WIDTHS=[...PHONES,1100,1440];
const viewport=width=>({width,height:width>760?900:844});
// QR_BROWSER_PATH optionally points at a preinstalled Chromium when the pinned Playwright build is absent.
const browser=await chromium.launch({headless:true,...(process.env.QR_BROWSER_PATH?{executablePath:process.env.QR_BROWSER_PATH}:{})});
// Measure settled geometry; hover transitions can introduce fractional rect noise.
const page=await browser.newPage({viewport:viewport(390),reducedMotion:'reduce'});
const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
let code;
const findings=[];
const nav=name=>page.getByRole('navigation',{name:'Main'}).getByRole('button',{name,exact:true});
async function capture(name,target=page){
 await target.evaluate(()=>window.scrollTo(0,0));
 const toast=target.getByRole('button',{name:'Dismiss notification',exact:true});if(await toast.isVisible())await toast.click();
 await target.evaluate(()=>document.fonts.ready);
 await target.waitForFunction(()=>[...document.querySelectorAll('.qr-preview')].filter(el=>el.getClientRects().length).every(el=>el.querySelector('img')?.complete&&el.querySelector('img')?.naturalWidth>0));
 const phone=target.viewportSize().width<=760;
 const measured=await target.evaluate(phone=>{
  const shown=el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';
  const rgb=value=>{const m=value.match(/rgba?\(([^)]+)\)/);if(!m)return null;const p=m[1].split(/[ ,/]+/).filter(Boolean).map(Number);return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};};
  const lum=({r,g,b})=>{const f=v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4;};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b);};
  const background=el=>{const layers=[];for(let n=el;n;n=n.parentElement){const c=rgb(getComputedStyle(n).backgroundColor);if(c&&c.a>0){layers.push(c);if(c.a>=1)break;}}let base={r:2,g:2,b:2};for(const c of layers.reverse())base={r:c.r*c.a+base.r*(1-c.a),g:c.g*c.a+base.g*(1-c.a),b:c.b*c.a+base.b*(1-c.a)};return base;};
  const text=[...document.querySelectorAll('body *')].filter(el=>shown(el)&&!el.closest('svg,script,style,option,.qr-preview')&&[...el.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim()));
  const tiny=text.filter(el=>parseFloat(getComputedStyle(el).fontSize)<12).map(el=>({text:el.textContent.trim().slice(0,70),size:getComputedStyle(el).fontSize}));
  const lowContrast=text.filter(el=>!el.closest(':disabled,[aria-disabled=true]')).map(el=>{const s=getComputedStyle(el);const fg=rgb(s.color);const bg=background(el);const mix={r:fg.r*fg.a+bg.r*(1-fg.a),g:fg.g*fg.a+bg.g*(1-fg.a),b:fg.b*fg.a+bg.b*(1-fg.a)};const a=lum(mix),b=lum(bg);const ratio=(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);const large=parseFloat(s.fontSize)>=24||(parseFloat(s.fontSize)>=18.66&&+s.fontWeight>=700);return {text:el.textContent.trim().slice(0,50),ratio:+ratio.toFixed(2),needed:large?3:4.5};}).filter(item=>item.ratio<item.needed);
  const controls=[...document.querySelectorAll('button,select,input:not([type=range]),summary,a[href]')].filter(shown);
  const small=phone?controls.filter(el=>!el.disabled&&el.getBoundingClientRect().height<44).map(el=>({name:el.getAttribute('aria-label')||el.textContent.trim().slice(0,45)||el.type,height:Math.round(el.getBoundingClientRect().height)})):[];
  return {overflow:document.documentElement.scrollWidth>innerWidth,tiny,lowContrast,small};
 },phone);
 findings.push({name,...measured});
 assert.equal(measured.overflow,false,'No horizontal page overflow: '+name);
 await target.screenshot({path:dir+name+'.png',fullPage:true});
}
async function openNew(){await page.getByRole('button',{name:'New code',exact:true}).first().click();await page.getByLabel('Name',{exact:true}).waitFor();}
try{
 await page.goto(base,{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:/^Codes/}).waitFor();
 for(const width of WIDTHS){
  await page.setViewportSize(viewport(width));
  await capture('codes-'+width);
  await openNew();
  await capture('create-'+width);
  await page.locator('summary',{hasText:'More styling'}).click();
  await capture('styling-'+width);
  await page.locator('summary',{hasText:'Tracking options'}).click();
  await capture('tracking-'+width);
  await nav('Codes').click();
 }
 await page.setViewportSize(viewport(390));
 await openNew();
 await page.getByLabel('Name',{exact:true}).fill('Readability check — long event name and book table');
 await page.getByLabel('Event',{exact:true}).fill('Readability check — developer community event 2027');
 await page.getByLabel('Placement',{exact:true}).fill('Book collection and fulfillment table');
 const saved=page.waitForResponse(r=>r.url().endsWith('/api/codes')&&r.request().method()==='POST');
 await page.locator('.mobile-bar').getByRole('button',{name:'Save',exact:true}).click();
 const response=await saved;assert.equal(response.status(),201);code=(await response.json()).code;
 await page.locator('.mobile-bar').getByRole('button',{name:'Download',exact:true}).waitFor();
 for(const width of WIDTHS){
  await page.setViewportSize(viewport(width));
  await capture('saved-'+width);
  if(width<=760){
   await page.getByRole('button',{name:'Show artwork and downloads',exact:true}).click();
   await capture('artwork-sheet-'+width);
   await page.getByRole('button',{name:'Close preview',exact:true}).click();
  }
 }
 const scan=await fetch(base+'/q/'+code.slug,{redirect:'manual',headers:{'user-agent':'Mozilla/5.0 (iPhone) Mobile'}});assert.equal(scan.status,302);
 for(const width of WIDTHS){
  await page.setViewportSize(viewport(width));
  await nav('Codes').click();await page.locator('.codes-table').getByText(code.name,{exact:true}).first().waitFor();await capture('library-'+width);
  await page.getByRole('button',{name:'More actions for '+code.name,exact:true}).first().click();
  await page.getByRole('menuitem',{name:'Sticker sheet…',exact:true}).click();
  await page.getByRole('dialog',{name:'Print on a sticker sheet'}).waitFor();await capture('sticker-'+width);
  await page.keyboard.press('Escape');
  await nav('Results').click();await page.locator('.kpis').waitFor();await page.getByRole('heading',{name:'Scans per day',exact:true}).waitFor();await capture('results-'+width);
 }
 // Visual review of sign-in and signup only; no account requests are submitted.
 const auth=await browser.newPage({viewport:viewport(320),reducedMotion:'reduce'});
 await auth.route('**/api/session',route=>route.fulfill({json:{configured:true,mode:'supabase',user:null}}));
 await auth.goto(base,{waitUntil:'networkidle'});
 for(const width of WIDTHS){
  await auth.setViewportSize(viewport(width));
  await capture('signin-'+width,auth);
  await auth.getByRole('button',{name:'New here? Create an account',exact:true}).click();
  await capture('signup-'+width,auth);
  await auth.getByRole('button',{name:'Already have an account? Sign in',exact:true}).click();
 }
 await auth.close();
 assert.deepEqual(errors,[]);
 await fs.writeFile(dir+'measurements.json',JSON.stringify(findings,null,2));
 const tiny=findings.filter(f=>f.tiny.length);const smallControls=findings.filter(f=>f.small.length);const lowContrast=findings.filter(f=>f.lowContrast.length);
 console.log(JSON.stringify({screens:findings.length,tiny,lowContrast,smallControls},null,2));
 assert.deepEqual(tiny,[],'Visible text must be at least 12px at every width');
 assert.deepEqual(lowContrast,[],'Text must meet 4.5:1 (3:1 for large text) against its background');
 assert.deepEqual(smallControls,[],'Enabled controls must be at least 44px tall on phones');
}finally{try{if(code)await archiveVerificationCode({base,code,request:(path,options)=>fetch(base+path,options),output:dir});}finally{await browser.close();}}
