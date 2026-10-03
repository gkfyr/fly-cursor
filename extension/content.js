(() => {
  if (globalThis.__flyCursorInstalled) return;
  globalThis.__flyCursorInstalled = true;
  let run = null;
  function destroy() {
    if (!run) return;
    run.stopped = true;
    cancelAnimationFrame(run.animation);
    clearTimeout(run.timer);
    clearTimeout(run.restoreTimer);
    run.host.remove();
    run = null;
  }
  async function stop() {
    const token = run?.token;
    destroy();
    if (token) await chrome.runtime.sendMessage({type:'PAGE_STOP', token}).catch(()=>{});
  }
  function start(token) {
    destroy();
    const host = document.createElement('div');
    host.setAttribute('data-fly-cursor','');
    host.style.cssText='all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;display:block!important;';
    const shadow = host.attachShadow({mode:'closed'});
    const canvas = document.createElement('canvas');
    canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
    const label = document.createElement('div');
    label.style.cssText='position:absolute;right:18px;bottom:18px;padding:10px 13px;border:1px solid #a5c78155;border-radius:8px;background:#172014ed;color:#d2f7ab;font:11px/1.6 system-ui,sans-serif;box-shadow:0 4px 24px #0004;pointer-events:none;';
    label.textContent='FLY / CONNECTOME · 연결 중 · ESC 정지';
    shadow.append(canvas,label);document.documentElement.append(host);
    const state = {token,host,canvas,label,ctx:canvas.getContext('2d'),x:.5,y:.5,heading:-Math.PI/2,
      vx:.5,vy:.5,angle:-Math.PI/2,trail:[],stopped:false,animation:0,timer:0,restoreTimer:0};
    run=state;
    function draw(t) {
      if(state.stopped)return;
      const w=innerWidth,h=innerHeight,dpr=Math.min(devicePixelRatio||1,2);
      if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){
        canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
      }
      const c=state.ctx;c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,w,h);
      c.lineWidth=1.3;c.strokeStyle='#a3d861aa';c.beginPath();
      state.trail.forEach(([x,y],i)=>i?c.lineTo(x*w,y*h):c.moveTo(x*w,y*h));c.stroke();
      if (!state.captureFrozen) {
        const dx=(state.x-state.vx)*w, dy=(state.y-state.vy)*h;
        // Face the actual interpolated travel vector, including negative drive.
        if (Math.hypot(dx,dy)>.01) state.angle=Math.atan2(dy,dx);
        state.vx+=(state.x-state.vx)*.12;state.vy+=(state.y-state.vy)*.12;
      }
      c.save();c.translate(state.vx*w,state.vy*h);c.rotate(state.angle+Math.PI/2);
      c.shadowColor='#0008';c.shadowBlur=4;
      c.strokeStyle='#d0e2b8';c.lineWidth=1.3;
      for(const side of [-1,1]){
        for(let i=0;i<3;i++){c.beginPath();c.moveTo(side*3,i*4-3);c.lineTo(side*(10+i),i*5-6);c.lineTo(side*(13+i),i*6-3);c.stroke();}
        c.save();c.rotate(side*(.45+Math.sin(t*.075)*.25));c.fillStyle='#f0f8dccc';c.beginPath();c.ellipse(side*7,4,6,13,side*.2,0,Math.PI*2);c.fill();c.stroke();c.restore();
      }
      c.fillStyle='#5e7444';c.strokeStyle='#d9ecb8';c.beginPath();c.ellipse(0,6,4,10,0,0,Math.PI*2);c.fill();c.stroke();
      c.fillStyle='#c8dba7';c.beginPath();c.ellipse(0,-3,5,5,0,0,Math.PI*2);c.fill();
      c.fillStyle='#df865f';for(const side of [-1,1]){c.beginPath();c.ellipse(side*3,-8,3,3,0,0,Math.PI*2);c.fill();}
      c.restore();state.animation=requestAnimationFrame(draw);
    }
    async function tick() {
      if(state.stopped)return;
      if(document.hidden){await stop();return;}
      try{
        const result=await chrome.runtime.sendMessage({type:'STEP',token});
        if(state.stopped)return;
        if(!result?.ok)throw Error(result?.error||'연결이 끊어졌습니다.');
        const o=result.output;
        if(![o.turn,o.drive].every(Number.isFinite))throw Error('잘못된 신경 출력');
        state.heading+=Math.max(-1,Math.min(1,o.turn))*.65;
        state.x+=Math.cos(state.heading)*Math.max(-1,Math.min(1,o.drive))*90/innerWidth;
        state.y+=Math.sin(state.heading)*Math.max(-1,Math.min(1,o.drive))*90/innerHeight;
        if(state.x<.025||state.x>.975){state.heading=Math.PI-state.heading;state.x=Math.max(.025,Math.min(.975,state.x));}
        if(state.y<.025||state.y>.975){state.heading=-state.heading;state.y=Math.max(.025,Math.min(.975,state.y));}
        state.trail.push([state.x,state.y]);if(state.trail.length>700)state.trail.shift();
        label.textContent=`FLY / ${o.active.toLocaleString()} 활성 뉴런 · ${o.compute_ms} ms · ESC 정지`;
        state.timer=setTimeout(tick,100);
      }catch(error){
        if(state.stopped)return;
        label.textContent=`FLY 정지 · ${error.message}`;
        // Keep the reason briefly visible; no further captures or neural requests.
        state.timer=setTimeout(()=>{if(run===state)stop();},3500);
      }
    }
    state.animation=requestAnimationFrame(draw);tick();
  }
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(sender.id!==chrome.runtime.id)return;
    if(message.type==='START'){start(message.token);respond({ok:true});return;}
    if(!run || message.token!==run.token){respond(null);return;}
    if(message.type==='DESTROY'){destroy();respond({ok:true});return;}
    if(message.type==='RELEASE'){
      clearTimeout(run.restoreTimer);run.captureFrozen=false;respond({ok:true});return;
    }
    if(message.type==='SNAPSHOT'){
      const state=run;state.captureFrozen=true;
      clearTimeout(state.restoreTimer);state.restoreTimer=setTimeout(()=>{state.captureFrozen=false;},2000);
      const rect=state.label.getBoundingClientRect();
      respond({x:state.x,y:state.y,heading:state.heading,width:innerWidth,height:innerHeight,
        overlay:{x:state.vx,y:state.vy,trail:state.trail.slice(),label:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}}});
    }
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape')stop();},true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  window.addEventListener('pagehide',()=>stop());
})();
