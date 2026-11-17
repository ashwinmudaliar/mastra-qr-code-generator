import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base='http://127.0.0.1:3147';
const dir=new URL('../outputs/mobile-readability/',import.meta.url).pathname;
await fs.mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true});
// Measure settled geometry; hover transitions can introduce fractional rect noise.
const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
const errors=[];page.on('pageerror',error=>errors.push(error.message));
let code;
const findings=[];
async function capture(name,target=page){
 await target.evaluate(()=>window.scrollTo(0,0));
 const toast=target.getByRole('button',{name:'Dismiss notification',exact:true});if(await toast.isVisible())await toast.click();
 await target.evaluate(()=>document.fonts.ready);
 await target.waitForFunction(()=>[...document.querySelectorAll('.qr-preview')].filter(el=>el.getClientRects().length).every(el=>el.querySelector('img')?.complete&&el.querySelector('img')?.naturalWidth>0));
 const measured=await target.evaluate(()=>{
  const shown=el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';
  const text=[...document.querySelectorAll('body *')].filter(el=>shown(el)&&!el.closest('svg,script,style,option')&&[...el.childNodes].some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim()));
  const tiny=text.filter(el=>parseFloat(getComputedStyle(el).fontSize)<12).map(el=>({text:el.textContent.trim().slice(0,70),size:getComputedStyle(el).fontSize}));
  const controls=[...document.querySelectorAll('button,select,input:not([type=range]),summary')].filter(shown);
  const small=controls.filter(el=>!el.disabled&&el.getBoundingClientRect().height<44).map(el=>({name:el.getAttribute('aria-label')||el.textContent.trim().slice(0,45)||el.type,height:Math.round(el.getBoundingClientRect().height)}));
  return {overflow:document.documentElement.scrollWidth>innerWidth,tiny,small};
 });
 findings.push({name,...measured});
 assert.equal(measured.overflow,false,'No horizontal page overflow: '+name);
 await target.screenshot({path:dir+name+'.png',fullPage:true});
}
try{
 await page.goto(base,{waitUntil:'networkidle'});
 for(const width of [320,360,390,430]){
  await page.setViewportSize({width,height:844});
  await capture('create-'+width);
  await page.getByRole('tab',{name:'Design',exact:true}).click();
  await capture('design-'+width);
  await page.getByText('Advanced design',{exact:true}).click();
  await capture('advanced-'+width);
  await page.getByRole('tab',{name:'Tracking',exact:true}).click();
  await page.getByText('Customize campaign tags',{exact:true}).click();
  await capture('tracking-'+width);
  await page.getByRole('tab',{name:'Content',exact:true}).click();
 }
 await page.getByLabel('QR code name').fill('Readability check — long event name and book table');
 await page.getByLabel('Event or campaign').fill('Readability check — developer community event 2027');
 await page.getByLabel('Placement',{exact:false}).fill('Book collection and fulfillment table');
 await page.getByRole('button',{name:'Preview',exact:true}).click();
 const saved=page.waitForResponse(r=>r.url().endsWith('/api/codes')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Save QR code',exact:true}).click();
 const response=await saved;assert.equal(response.status(),201);code=(await response.json()).code;
 await page.getByRole('button',{name:'Download PNG',exact:true}).waitFor();
 for(const width of [320,360,390,430]){await page.setViewportSize({width,height:844});await capture('preview-'+width);}
 const scan=await fetch(base+'/q/'+code.slug,{redirect:'manual',headers:{'user-agent':'Mozilla/5.0 (iPhone) Mobile'}});assert.equal(scan.status,302);
 for(const width of [320,360,390,430]){
  await page.setViewportSize({width,height:844});
  await page.getByRole('button',{name:'Your QR codes',exact:true}).click();await page.getByText(code.name,{exact:true}).waitFor();await capture('library-'+width);
  await page.getByRole('button',{name:'Scan analytics',exact:true}).click();await page.getByText('Recent scans',{exact:true}).waitFor();await capture('analytics-'+width);
  await page.getByRole('button',{name:'How tracking works',exact:true}).click();await capture('guide-'+width);
 }
 // Visual review of sign-in and signup only; no account requests are submitted.
 const auth=await browser.newPage({viewport:{width:320,height:844},reducedMotion:'reduce'});
 await auth.route('**/api/session',route=>route.fulfill({json:{configured:true,mode:'supabase',user:null}}));
 await auth.goto(base,{waitUntil:'networkidle'});
 for(const width of [320,360,390,430]){
  await auth.setViewportSize({width,height:844});
  await capture('signin-'+width,auth);
  await auth.getByRole('button',{name:'New here? Create an account',exact:true}).click();
  await capture('signup-'+width,auth);
  await auth.getByRole('button',{name:'Already have an account? Sign in',exact:true}).click();
 }
 await auth.close();
 assert.deepEqual(errors,[]);
 await fs.writeFile(dir+'measurements.json',JSON.stringify(findings,null,2));
 const tiny=findings.filter(f=>f.tiny.length);const smallControls=findings.filter(f=>f.small.length);
 console.log(JSON.stringify({screens:findings.length,tiny,smallControls},null,2));
 assert.deepEqual(tiny,[],'Visible text must be at least 12px at mobile widths');
 assert.deepEqual(smallControls,[],'Enabled controls must be at least 44px tall');
}finally{if(code)await fetch(base+'/api/codes/'+code.id,{method:'DELETE'});await browser.close();}
