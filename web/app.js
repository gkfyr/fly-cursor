const $ = id => document.getElementById(id);
const world = $('world'), overlay = $('overlay'), ctx = world.getContext('2d'), ink = overlay.getContext('2d');
const retina = $('retina'), eye = retina.getContext('2d', {willReadFrequently:true});
let width=800, height=600, running=false, pending=false, generation=0;
let fly={x:.5,y:.5,heading:-Math.PI/2}, visual={...fly}, trail=[], light=null;
const groups={left:'DNa02 L',right:'DNa02 R',forward:'DNa01',reverse:'MDN',stop:'DNp09'};
$('meters').innerHTML=Object.entries(groups).map(([k,v])=>`<div class="meter"><span>${v}</span><div class="bar"><i id="bar-${k}"></i></div><b id="hz-${k}">0</b></div>`).join('');
async function api(path, data){
  const response=await fetch('/api/'+path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const result=await response.json(); if(!response.ok) throw Error(result.error||'연결 실패'); return result;
}
function resize(){ const box=$('arena').getBoundingClientRect();width=Math.round(box.width);height=Math.round(box.height);for(const canvas of [world,overlay]){canvas.width=width;canvas.height=height;}drawWorld();}
new ResizeObserver(resize).observe($('arena'));
function drawWorld(){
  ctx.fillStyle='#141814';ctx.fillRect(0,0,width,height);
  const scene=$('scene').value;
  if(scene==='stripes'){
    for(let x=0;x<width;x+=70){ctx.fillStyle=(Math.floor(x/70)%2)?'#222922':'#cbd5b7';ctx.fillRect(x,0,70,height);}
  }else if(scene==='islands'){
    ctx.strokeStyle='#253024';ctx.lineWidth=1;
    for(let x=20;x<width;x+=36)for(let y=20;y<height;y+=36){ctx.fillStyle='#303c2d';ctx.fillRect(x,y,1,1);}
    [[.23,.32,68],[.73,.24,46],[.68,.73,88],[.28,.77,34]].forEach(([x,y,r],i)=>{
      const g=ctx.createRadialGradient(x*width,y*height,4,x*width,y*height,r*1.7);g.addColorStop(0,['#bed58d','#d8cba8','#97b6a2','#b4bd9c'][i]);g.addColorStop(.5,'#546446');g.addColorStop(1,'#141814');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x*width,y*height,r*1.7,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#74845c55';ctx.beginPath();ctx.arc(x*width,y*height,r*1.8,0,Math.PI*2);ctx.stroke();
    });
  }
  if(light){const x=light.x*width,y=light.y*height;const g=ctx.createRadialGradient(x,y,0,x,y,95);g.addColorStop(0,'#fffbe3');g.addColorStop(.3,'#ddebab');g.addColorStop(1,'#ddebab00');ctx.fillStyle=g;ctx.fillRect(x-95,y-95,190,190);}
}
function sample(){
  eye.save();eye.fillStyle='#141814';eye.fillRect(0,0,64,40);
  eye.translate(32,20);eye.scale(64/300,40/210);eye.rotate(-fly.heading-Math.PI/2);
  eye.drawImage(world,-fly.x*width,-fly.y*height);eye.restore();
  const raw=eye.getImageData(0,0,64,40).data, pixels=[];
  for(let i=0;i<raw.length;i+=4)pixels.push(Number(((.2126*raw[i]+.7152*raw[i+1]+.0722*raw[i+2])/255).toFixed(4)));
  return pixels;
}
function setRunning(value){running=value;$('toggle').textContent=running?'Ⅱ 일시 정지':'▶ 실험 시작';$('state').textContent=running?'신경 활동 관찰 중':'일시 정지';$('status-dot').classList.toggle('running',running);if(running)tick();}
async function tick(){
  if(!running||pending)return;pending=true;const token=generation;
  try{
    const result=await api('step',{width:64,height:40,pixels:sample(),enabled:$('vision').checked});
    if(token!==generation||!running)return;
    fly.heading+=result.turn*.65;
    fly.x+=Math.cos(fly.heading)*result.drive*90/width;
    fly.y+=Math.sin(fly.heading)*result.drive*90/height;
    // Reflect at viewport edges: explicit interface boundary, not neural behavior.
    if(fly.x<.025||fly.x>.975){fly.heading=Math.PI-fly.heading;fly.x=Math.max(.025,Math.min(.975,fly.x));}
    if(fly.y<.025||fly.y>.975){fly.heading=-fly.heading;fly.y=Math.max(.025,Math.min(.975,fly.y));}
    trail.push([fly.x,fly.y]);if(trail.length>2500)trail.shift();
    $('active').textContent=result.active.toLocaleString();$('simtime').textContent=result.sim_ms.toLocaleString()+' ms';$('latency').textContent=result.compute_ms+' ms';
    for(const k of Object.keys(groups)){$('hz-'+k).textContent=Math.round(result.hz[k]);$('bar-'+k).style.width=Math.min(100,result.hz[k]/4.5)+'%';}
    $('coordinates').textContent=`X ${fly.x.toFixed(3)} / Y ${fly.y.toFixed(3)}`;
  }catch(error){setRunning(false);$('connection').textContent='오류: '+error.message;}
  finally{pending=false;if(running)setTimeout(tick,30);}
}
$('toggle').onclick=()=>setRunning(!running);
$('reset').onclick=async()=>{
  setRunning(false);generation++;$('toggle').disabled=true;$('reset').disabled=true;
  try{await api('reset',{seed:42});fly={x:.5,y:.5,heading:-Math.PI/2};visual={...fly};trail=[];$('active').textContent='0';$('simtime').textContent='0 ms';$('latency').textContent='—';$('coordinates').textContent='X 0.500 / Y 0.500';for(const k of Object.keys(groups)){$('hz-'+k).textContent='0';$('bar-'+k).style.width='0';}sample();$('state').textContent='초기화 완료';}
  catch(error){$('connection').textContent='오류: '+error.message;}
  finally{$('toggle').disabled=false;$('reset').disabled=false;}
};
document.addEventListener('keydown',e=>{if(e.key==='Escape')setRunning(false);});
document.addEventListener('visibilitychange',()=>{if(document.hidden)setRunning(false);});
$('scene').onchange=()=>{light=null;drawWorld();sample();};
world.onclick=e=>{const r=world.getBoundingClientRect();light={x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height};drawWorld();sample();};
function drawFly(t){
  ink.clearRect(0,0,width,height);
  if($('trail').checked&&trail.length>1){ink.strokeStyle='#c6ee8a70';ink.lineWidth=1;ink.beginPath();trail.forEach(([x,y],i)=>i?ink.lineTo(x*width,y*height):ink.moveTo(x*width,y*height));ink.stroke();}
  // Interpolate display only; the next sensory frame uses the authoritative position.
  visual.x+=(fly.x-visual.x)*.16;visual.y+=(fly.y-visual.y)*.16;
  const angle=Math.atan2(Math.sin(fly.heading-visual.heading),Math.cos(fly.heading-visual.heading));visual.heading+=angle*.16;
  ink.save();ink.translate(visual.x*width,visual.y*height);
  ink.strokeStyle='#d5f5a52c';ink.beginPath();ink.arc(0,0,24,0,Math.PI*2);ink.stroke();
  ink.rotate(visual.heading+Math.PI/2);
  const flap=running?Math.sin(t*.085)*.35:0;
  for(const side of [-1,1]){
    ink.strokeStyle='#c3cbab';ink.lineWidth=1;
    for(let i=0;i<3;i++){ink.beginPath();ink.moveTo(side*3,i*4-3);ink.lineTo(side*(9+i),i*5-6);ink.lineTo(side*(12+i),i*6-3);ink.stroke();}
    ink.save();ink.rotate(side*(.45+flap));ink.fillStyle='#e6f4cfaa';ink.strokeStyle='#f4ffe0aa';ink.beginPath();ink.ellipse(side*6,4,5,12,side*.2,0,Math.PI*2);ink.fill();ink.stroke();ink.restore();
  }
  ink.fillStyle='#5f694b';ink.strokeStyle='#d5e0a8';ink.beginPath();ink.ellipse(0,6,4,9,0,0,Math.PI*2);ink.fill();ink.stroke();
  ink.fillStyle='#bec79d';ink.beginPath();ink.ellipse(0,-3,4.5,5,0,0,Math.PI*2);ink.fill();
  ink.fillStyle='#d48558';for(const s of [-1,1]){ink.beginPath();ink.ellipse(s*3,-8,2.6,3,0,0,Math.PI*2);ink.fill();}
  ink.restore();requestAnimationFrame(drawFly);
}
resize();sample();requestAnimationFrame(drawFly);
try{const meta=await api('status');$('neurons').textContent=meta.neurons.toLocaleString();$('edges').textContent=meta.edges.toLocaleString();$('connection').textContent='● 실제 연결 데이터 로드됨';$('toggle').disabled=false;$('reset').disabled=false;}
catch(error){$('connection').textContent='시뮬레이터 연결 실패';$('state').textContent='서버 실행 상태를 확인해주세요';}
