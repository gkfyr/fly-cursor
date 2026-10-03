const BASE = 'http://127.0.0.1:8765';
let busy = false;
let lastCapture = 0;
async function backend(path, data) {
  const response = await fetch(BASE + '/api/' + path, {
    ...(data === undefined ? {} : {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)}),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw Error(`시뮬레이터 오류 (${response.status}). 서버를 최신 코드로 다시 실행하세요.`);
  return response.json();
}
async function activeSession() { return (await chrome.storage.session.get('session')).session; }
async function stop() {
  const session = await activeSession();
  await chrome.storage.session.remove('session');
  if (session) await chrome.tabs.sendMessage(session.tabId, {type:'DESTROY', token:session.token}).catch(()=>{});
  await chrome.action.setBadgeText({text:''});
}
async function selectedTab(tabId, windowId) {
  const [tab] = await chrome.tabs.query({active:true, windowId});
  // captureVisibleTab targets this explicit window, not the focused window.
  // Extension popups / macOS focus transitions must not count as tab switches.
  return tab?.id === tabId;
}
async function step(message, sender) {
  const session = await activeSession();
  if (!session || session.tabId !== sender.tab?.id || message.token !== session.token || sender.frameId !== 0)
    throw Error('실험이 종료되었습니다.');
  if (busy) throw Error('이전 계산이 진행 중입니다. 다시 시작하세요.');
  busy = true;
  let bitmap;
  try {
    if (!await selectedTab(session.tabId,session.windowId)) throw Error('탭 전환으로 정지했습니다.');
    const wait = Math.max(0, 650 - (Date.now()-lastCapture));
    if (wait) await new Promise(resolve => setTimeout(resolve,wait));
    if (!await selectedTab(session.tabId,session.windowId)) throw Error('탭 전환으로 정지했습니다.');
    const pose = await chrome.tabs.sendMessage(session.tabId,{type:'SNAPSHOT',token:session.token});
    if (!pose || ![pose.x,pose.y,pose.heading,pose.width,pose.height].every(Number.isFinite) || pose.width<=0 || pose.height<=0)
      throw Error('페이지 크기를 확인할 수 없습니다.');
    let screenshot;
    try {
      lastCapture = Date.now();
      screenshot = await chrome.tabs.captureVisibleTab(session.windowId,{format:'png'});
    } finally {
      await chrome.tabs.sendMessage(session.tabId,{type:'RELEASE',token:session.token}).catch(()=>{});
    }
    if (!await selectedTab(session.tabId,session.windowId)) throw Error('탭 전환으로 프레임을 폐기했습니다.');
    bitmap = await createImageBitmap(await (await fetch(screenshot)).blob());
    screenshot = null;
    const canvas = new OffscreenCanvas(64,40);
    const context = canvas.getContext('2d',{willReadFrequently:true});
    context.fillStyle='#141814';context.fillRect(0,0,64,40);
    context.translate(32,20);context.scale(64/300,40/210);context.rotate(-pose.heading-Math.PI/2);
    // Draw in CSS pixels, independent of screenshot device scale / zoom.
    context.drawImage(bitmap,-pose.x*pose.width,-pose.y*pose.height,pose.width,pose.height);
    bitmap.close();bitmap=null;
    const raw=context.getImageData(0,0,64,40).data;
    // Keep the overlay visible; exclude its footprints from sensory input.
    // Occluded page pixels cannot be recovered: fill with unmasked mean luminance.
    const mask=new OffscreenCanvas(64,40), m=mask.getContext('2d',{willReadFrequently:true});
    m.translate(32,20);m.scale(64/300,40/210);m.rotate(-pose.heading-Math.PI/2);
    m.translate(-pose.x*pose.width,-pose.y*pose.height);
    const overlay=pose.overlay;
    if(overlay){
      m.fillStyle='white';m.strokeStyle='white';m.lineWidth=8;
      m.beginPath();m.arc(overlay.x*pose.width,overlay.y*pose.height,36,0,Math.PI*2);m.fill();
      m.beginPath();overlay.trail.forEach(([x,y],i)=>i?m.lineTo(x*pose.width,y*pose.height):m.moveTo(x*pose.width,y*pose.height));m.stroke();
      const r=overlay.label;m.fillRect(r.x-16,r.y-16,r.width+32,r.height+32);
    }
    const masked=m.getImageData(0,0,64,40).data;
    const pixels=[];let sum=0,count=0;
    for(let i=0;i<raw.length;i+=4){
      const lum=(.2126*raw[i]+.7152*raw[i+1]+.0722*raw[i+2])/255;
      pixels.push(lum);if(!masked[i+3]){sum+=lum;count++;}
    }
    const replacement=count?sum/count:.5;
    for(let i=0;i<pixels.length;i++)pixels[i]=Number((masked[i*4+3]?replacement:pixels[i]).toFixed(4));
    if ((await activeSession())?.token !== session.token) throw Error('실험이 종료되었습니다.');
    return await backend('step',{width:64,height:40,pixels,enabled:true});
  } finally { bitmap?.close();busy=false; }
}
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  (async()=>{
    if (sender.id !== chrome.runtime.id) throw Error('허용되지 않은 요청');
    if(message.type==='STEP') return {ok:true,output:await step(message,sender)};
    if(message.type==='PAGE_STOP') {
      const session=await activeSession();
      if(session?.tabId===sender.tab?.id && session.token===message.token) await stop();
      return {ok:true};
    }
    // Control messages are accepted only from our own popup, never a page.
    if(sender.tab || sender.url!==chrome.runtime.getURL('popup.html')) throw Error('허용되지 않은 요청');
    if(message.type==='STATUS') return {ok:true,meta:await backend('status'),active:!!await activeSession()};
    if(message.type==='STOP') {await stop();return {ok:true};}
    if(message.type==='START') {
      const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
      if(!tab?.id || !/^https?:\/\//.test(tab.url || '')) throw Error('일반 HTTP/HTTPS 웹사이트에서 시작하세요.');
      if(busy) throw Error('계산이 마무리되는 중입니다. 잠시 후 다시 시작하세요.');
      await backend('status');await stop();
      await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']});
      const session={tabId:tab.id,windowId:tab.windowId,token:crypto.randomUUID()};
      await chrome.storage.session.set({session});
      try { await chrome.tabs.sendMessage(tab.id,{type:'START',token:session.token}); }
      catch(error){await stop();throw error;}
      await chrome.action.setBadgeText({text:'ON'});await chrome.action.setBadgeBackgroundColor({color:'#567638'});
      return {ok:true};
    }
    throw Error('알 수 없는 요청');
  })().then(respond).catch(error=>respond({ok:false,error:error.message}));
  return true;
});
chrome.tabs.onActivated.addListener(async info=>{const s=await activeSession();if(s && s.windowId===info.windowId && s.tabId!==info.tabId)await stop();});
chrome.tabs.onRemoved.addListener(async id=>{if((await activeSession())?.tabId===id)await stop();});
chrome.tabs.onUpdated.addListener(async(id,change)=>{if(change.status==='loading' && (await activeSession())?.tabId===id)await stop();});
