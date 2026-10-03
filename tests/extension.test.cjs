const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const manifest=JSON.parse(fs.readFileSync('extension/manifest.json','utf8'));
function harness(){
  const listeners={},events={},calls=[],store={};
  let focused=true,active=7,captureError=false;
  const id=fs.readFileSync('extension-id.txt','utf8').trim();
  const event=name=>({addListener:fn=>events[name]=fn});
  const chrome={runtime:{id,getURL:p=>`chrome-extension://${id}/${p}`,onMessage:{addListener:fn=>listeners.message=fn}},
    storage:{session:{get:async()=>({...store}),set:async data=>Object.assign(store,data),remove:async()=>{delete store.session;}}},
    tabs:{query:async()=>[{id:active,windowId:1,url:'https://example.com'}],
      sendMessage:async(id,m)=>{calls.push(m.type);return m.type==='SNAPSHOT'?{x:.5,y:.5,heading:0,width:1200,height:800,overlay:{x:.5,y:.5,trail:[[.5,.5]],label:{x:900,y:700,width:200,height:50}}}:{ok:true};},
      captureVisibleTab:async()=>{calls.push('CAPTURE');if(captureError)throw Error('capture denied');return 'data:image/png;base64,AA==';},
      onActivated:event('activated'),onRemoved:event('removed'),onUpdated:event('updated')},
    windows:{get:async()=>({focused}),onFocusChanged:event('focus')},
    scripting:{executeScript:async()=>calls.push('INJECT')},
    action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},
  };
  const fetch=async(url,options)=>{
    if(url.startsWith('data:'))return {blob:async()=>({})};
    calls.push({url,data:options.body&&JSON.parse(options.body)});
    return {ok:true,json:async()=>url.endsWith('status')?{neurons:165122}:{turn:.2,drive:.1,active:200,compute_ms:30}};
  };
  let canvasCount=0;
  class OffscreenCanvas{
    constructor(){this.mask=canvasCount++%2===1;}
    getContext(){const mask=this.mask;return {beginPath(){},arc(){},fill(){},moveTo(){},lineTo(){},stroke(){},fillRect(){},translate(){},scale(){},rotate(){},drawImage(...args){calls.push({draw:args.slice(1)});},getImageData(){const data=new Uint8ClampedArray(64*40*4).fill(mask?0:255);data.set(mask?[255,255,255,255]:[0,0,0,255],0);return {data};}};}
  }
  vm.runInNewContext(fs.readFileSync('extension/background.js','utf8'),{chrome,fetch,crypto,AbortSignal,OffscreenCanvas,
    createImageBitmap:async()=>({close(){calls.push('CLOSE_BITMAP');}}),setTimeout:fn=>{fn();return 1;},Date,console});
  const popup={id,url:chrome.runtime.getURL('popup.html')};
  const content={id,tab:{id:7},frameId:0};
  const send=(message,sender=popup)=>new Promise(resolve=>listeners.message(message,sender,resolve));
  return {send,store,calls,events,content,setActive:v=>active=v,setFocused:v=>focused=v,failCapture:()=>captureError=true};
}
test('manifest key matches server allowlist; no all-sites or tabs permission',()=>{
  const hex=crypto.createHash('sha256').update(Buffer.from(manifest.key,'base64')).digest('hex').slice(0,32);
  const id=[...hex].map(n=>String.fromCharCode(97+parseInt(n,16))).join('');
  assert.equal(id,fs.readFileSync('extension-id.txt','utf8').trim());
  assert.deepEqual(manifest.permissions,['activeTab','scripting','storage']);
  assert.deepEqual(manifest.host_permissions,['http://127.0.0.1/*']);
});
test('start, snapshot/capture/release, local luminance request, stop',async()=>{
  const h=harness();assert.equal((await h.send({type:'START'})).ok,true);
  const token=h.store.session.token;
  const r=await h.send({type:'STEP',token},h.content);assert.equal(r.ok,true);
  const names=h.calls.filter(x=>typeof x==='string');
  assert.ok(names.indexOf('SNAPSHOT')<names.indexOf('CAPTURE'));
  assert.ok(names.indexOf('CAPTURE')<names.indexOf('RELEASE'));
  const step=h.calls.find(x=>x.url?.endsWith('/step'));
  assert.equal(step.data.pixels.length,2560);assert.ok(step.data.pixels.every(x=>x===1));
  assert.deepEqual(Object.keys(step.data).sort(),['enabled','height','pixels','width']);
  assert.equal((await h.send({type:'STOP'})).ok,true);assert.equal(h.store.session,undefined);
});
test('page cannot issue START or impersonate another session',async()=>{
  const h=harness();assert.equal((await h.send({type:'START'},h.content)).ok,false);
  await h.send({type:'START'});
  assert.equal((await h.send({type:'STEP',token:'wrong'},h.content)).ok,false);
  assert.equal(h.calls.includes('CAPTURE'),false);
});
test('inactive tab never captured; navigation clears session',async()=>{
  const h=harness();await h.send({type:'START'});const token=h.store.session.token;
  h.setActive(8);
  assert.equal((await h.send({type:'STEP',token},h.content)).ok,false);
  assert.equal(h.calls.includes('CAPTURE'),false);
  await h.events.updated(7,{status:'loading'});assert.equal(h.store.session,undefined);
});
test('popup focus loss does not stop the selected tab',async()=>{
  const h=harness();h.setFocused(false);
  assert.equal((await h.send({type:'START'})).ok,true);
  const token=h.store.session.token;
  assert.equal((await h.send({type:'STEP',token},h.content)).ok,true);
  assert.ok(h.calls.includes('CAPTURE'));
  assert.equal(h.store.session.token,token);
  assert.equal(h.events.focus,undefined);
});
test('activation in another window is ignored, same-window tab switch stops',async()=>{
  const h=harness();await h.send({type:'START'});
  await h.events.activated({tabId:99,windowId:2});
  assert.ok(h.store.session);
  await h.events.activated({tabId:8,windowId:1});
  assert.equal(h.store.session,undefined);
  assert.ok(h.calls.includes('DESTROY'));
});
test('capture failure restores overlay and releases in-flight lock',async()=>{
  const h=harness();await h.send({type:'START'});h.failCapture();
  const r=await h.send({type:'STEP',token:h.store.session.token},h.content);
  assert.equal(r.ok,false);assert.ok(h.calls.includes('RELEASE'));
  assert.equal((await h.send({type:'START'})).ok,true);
});

for(const drive of [1,-1]) test(`content faces travel with drive ${drive}, stays visible, and Esc removes it`,async()=>{
  let listener;
  const events={},frames=[],hosts=[],messages=[],rotations=[],styles=[];
  const context={setTransform(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},save(){},translate(){},rotate(value){rotations.push(value);},ellipse(){},fill(){},restore(){}};
  const makeElement=tag=>({tag,style:{setProperty(...args){styles.push(args);}},setAttribute(){},attachShadow(){return {append(){}};},
    getBoundingClientRect(){return {x:0,y:0,width:100,height:30};},getContext(){return context;},remove(){this.removed=true;}});
  const document={hidden:false,createElement:makeElement,documentElement:{append:host=>hosts.push(host)},addEventListener:(name,fn)=>events[name]=fn};
  const chrome={runtime:{id:'test',onMessage:{addListener:fn=>listener=fn},sendMessage:async message=>{
    messages.push(message);return {ok:true,output:{turn:0,drive,active:500,compute_ms:30}};
  }}};
  const sandbox={document,chrome,innerWidth:1000,innerHeight:800,devicePixelRatio:2,
    window:{addEventListener:(name,fn)=>events[name]=fn},
    requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},cancelAnimationFrame(){},
    setTimeout:()=>1,clearTimeout(){},console};
  vm.runInNewContext(fs.readFileSync('extension/content.js','utf8'),sandbox);
  listener({type:'START',token:'one'},{id:'test'},()=>{});
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(hosts[0].style.cssText.includes('pointer-events:none'));
  assert.equal(messages[0].type,'STEP');
  frames.shift()(0);
  let pose;
  listener({type:'SNAPSHOT',token:'one'},{id:'test'},data=>pose=data);
  assert.ok(drive===1?pose.y<.5:pose.y>.5);assert.equal(pose.x,.5);
  assert.ok(Math.abs(rotations[0]-(drive===1?0:Math.PI))<1e-8);
  assert.equal(styles.some(args=>args[0]==='visibility'),false);
  events.keydown({key:'Escape'});
  assert.equal(hosts[0].removed,true);
  assert.equal(messages.at(-1).type,'PAGE_STOP');
  vm.runInNewContext(fs.readFileSync('extension/content.js','utf8'),sandbox);
  assert.equal(hosts.length,1);
});
