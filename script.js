/* =====================================================================
   Simulador técnico Genie GS-2046 / GS-2646 / GS-3246 / GS-3232 (manuais de serviço 97385PB e de peças 1267431GT)
   script.js: scripts clássicos (sem módulos ES), funcionam abrindo index.html direto do disco.

   ÍNDICE
     00 Utilitários de escrita no DOM + módulos Store, A11y, Sound, Touch
     01 SCENE3D    primitivas CSS 3D (node, box, cyl, pin, setSeg)
     02 REGISTRY   registro de peças (REG)
     03 LINES      mangueiras e fios (LN)
     04 CAMERA     câmera, vistas, ponteiro, inércia, teclado
     05 STATE      estado da simulação (S, GEO)
     06 MACHINE    construção da máquina e do bloco de estabilizadores (GS-3232)
     07 MODELS     modelos e especificações por modelo
     08 FAULTS     tabela de falhas do manual
     09 INFO       seleção, painel da peça, lista, falhas
     10 SCHEM      esquemas do manual, nº de série, símbolos clicáveis
     11 LOGIC      ECM: saídas, tempos, velocidades, nivelamento
     12 RENDER     aplicação do estado na cena
     14 UI         abas ARIA, painéis, comandos, atalhos, persistência
     15 LOOP       animação   |   16 INIT   |   window.GS (depuração)
   ===================================================================== */
(()=>{
const D=Math.PI/180, $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
function el(tag,cls,parent,css){const e=document.createElement(tag);if(cls)e.className=cls;if(css)e.style.cssText=css;if(parent)parent.appendChild(e);return e}
const world=$('#world'), stage=$('#stage');

/* ===== 00 · UTILITÁRIOS DE ESCRITA NO DOM (evitam reflow/style recalc desnecessário) ===== */
const IMG_URL=k=>(window.GS_IMG_INLINE&&window.GS_IMG_INLINE[k])||'img/'+k+'.jpg';   /* build single-file injeta GS_IMG_INLINE */
const setTf=(e,v)=>{if(e._tf!==v){e._tf=v;e.style.transform=v}};      /* só escreve se mudou */
const setTx=(e,v)=>{if(e._tx!==v){e._tx=v;e.textContent=v}};
const setW=(e,v)=>{if(e._w!==v){e._w=v;e.style.width=v}};
const $c=(()=>{const c={};return id=>c[id]||(c[id]=document.querySelector(id))})();   /* cache de seletores */
let booted=false, outsH='', lampsH='';

/* ===== MÓDULO · Store: persistência em localStorage (sempre com try/catch) ===== */
const Store=(()=>{
  const KEY='gs-sim-v1';let timer=0;
  const api={quiet:false,collect:null,
    load(){try{const o=JSON.parse(localStorage.getItem(KEY)||'null');return o&&typeof o==='object'?o:{}}catch(e){return {}}},
    save(){if(api.quiet||!api.collect)return;clearTimeout(timer);timer=setTimeout(api.flush,200)},
    flush(){try{localStorage.setItem(KEY,JSON.stringify(Object.assign({v:1},api.collect())))}catch(e){}},
    reset(){try{localStorage.removeItem(KEY)}catch(e){}}};
  addEventListener('pagehide',()=>{if(api.collect&&!api.quiet)api.flush()});
  return api})();

/* ===== MÓDULO · A11y: anúncios para leitores de tela ===== */
const A11y=(()=>{const live=document.getElementById('sr');let t=0;
  return{say(m){if(!live)return;clearTimeout(t);live.textContent='';t=setTimeout(()=>{live.textContent=m},60)}}})();

/* ===== MÓDULO · Sound: Web Audio opcional (relés, solenoides, motor M5, fluxo hidráulico, alarme H5) ===== */
const Sound=(()=>{
  let ctx=null,master=null,nb=null,N={},want=false,prevPw=null,prevEs=null,prevQd=null;const prev={},last={};
  const EDGE=['Y8','Y7','Y9','Y6','Y5','Y3','Y4','Y1','Y39','Y40'];
  function make(){
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return false;
    ctx=new AC();master=ctx.createGain();master.gain.value=0;master.connect(ctx.destination);
    const len=ctx.sampleRate*2;nb=ctx.createBuffer(1,len,ctx.sampleRate);const d=nb.getChannelData(0);for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
    /* motor elétrico M5: dois osciladores filtrados */
    const mg=ctx.createGain();mg.gain.value=0;const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=700;
    const o1=ctx.createOscillator();o1.type='sawtooth';o1.frequency.value=45;const o2=ctx.createOscillator();o2.type='triangle';o2.frequency.value=90;
    o1.connect(lp);o2.connect(lp);lp.connect(mg);mg.connect(master);o1.start();o2.start();
    /* fluxo de óleo: ruído passa-faixa */
    const src=ctx.createBufferSource();src.buffer=nb;src.loop=true;const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=650;bp.Q.value=.7;
    const hg=ctx.createGain();hg.gain.value=0;src.connect(bp);bp.connect(hg);hg.connect(master);src.start();
    /* alarme H5 */
    const al=ctx.createOscillator();al.type='square';al.frequency.value=2100;const ag=ctx.createGain();ag.gain.value=0;al.connect(ag);ag.connect(master);al.start();
    N={mg,o1,o2,lp,hg,bp,ag};return true}
  function tick(vol,f,dur){const t=ctx.currentTime,s=ctx.createBufferSource();s.buffer=nb;const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=f;bp.Q.value=1.8;
    const g=ctx.createGain();g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);s.connect(bp);bp.connect(g);g.connect(master);s.start(t,Math.random()*1.5,dur+.02)}
  function thunk(vol){const t=ctx.currentTime,o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.setValueAtTime(150,t);o.frequency.exponentialRampToValueAtTime(55,t+.08);
    g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+.11);o.connect(g);g.connect(master);o.start(t);o.stop(t+.13)}
  const to=(p,k,v,tc)=>{const q=Math.round(v*1000)/1000;if(last[k]===q)return;last[k]=q;p.setTargetAtTime(q,ctx.currentTime,tc)};
  const api={
    get enabled(){return want},
    set(v){want=!!v;if(want)api.unlock();else if(ctx)master.gain.setTargetAtTime(0,ctx.currentTime,.05)},
    /* o navegador só libera áudio depois de um gesto do usuário */
    unlock(){if(!want)return;if(!ctx&&!make()){want=false;return}if(ctx.state==='suspended')ctx.resume();master.gain.setTargetAtTime(.8,ctx.currentTime,.05)},
    update(S,o,pw,flashOn){
      if(!ctx||!want||ctx.state!=='running')return;
      if(pw!==prevPw){if(prevPw!==null){tick(.55,1500,.05);thunk(.35)}prevPw=pw}              /* contator / chave KS1 */
      if(S.estop!==prevEs){if(prevEs!==null){tick(.6,1200,.06);thunk(.4)}prevEs=S.estop}      /* botão de emergência */
      if(S.qd1!==prevQd){if(prevQd!==null)thunk(.45);prevQd=S.qd1}                            /* conector QD1 */
      for(const k of EDGE){const v=!!o[k];if(prev[k]!==v){if(prev[k]!==undefined){tick(.35,2400,.03);thunk(.18)}prev[k]=v}}   /* relés e bobinas */
      const f=58+Math.round(S.P)*.45;
      to(N.mg.gain,'mg',o.pump?.05:0,.12);to(N.o1.frequency,'o1',o.pump?f:45,.15);to(N.o2.frequency,'o2',o.pump?f*2.02:90,.15);to(N.lp.frequency,'lp',500+Math.round(S.P)*5,.2);
      to(N.hg.gain,'hg',o.pump?.012+S.P/255*.05:(o.Y7?.02:0),.12);
      to(N.ag.gain,'ag',(o.H5&&flashOn)?.03:0,.01)}};
  return api})();

/* ===== MÓDULO · Touch: Modo Câmera / Modo Operação (evita conflito entre arrastar a cena e os botões) ===== */
const Touch=(()=>{
  const mq=matchMedia('(pointer:coarse)'),api={enabled:false,mode:'camera'};
  api.cam=()=>!api.enabled||api.mode==='camera';
  const paint=()=>{stage.classList.toggle('op',api.enabled&&api.mode==='operation');$$('#tmodeSeg button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.tm===api.mode))};
  api.set=(m,quiet)=>{api.mode=m;paint();if(!quiet){A11y.say(m==='camera'?'Modo Câmera: arraste para girar a cena e use a pinça para aproximar.':'Modo Operação: a cena não gira com o toque. Use os botões na tela para operar a máquina.');Store.save()}};
  const sync=()=>{api.enabled=mq.matches;document.body.classList.toggle('touch',api.enabled);paint()};
  sync();if(mq.addEventListener)mq.addEventListener('change',sync);else if(mq.addListener)mq.addListener(sync);
  $$('#tmodeSeg button').forEach(b=>b.onclick=()=>api.set(b.dataset.tm));
  return api})();


/* ===== 01 · SCENE3D · primitivas 3D (y para cima) ===== */
function node(parent,x,y,z,id,layer,cls){const n=el('div','n'+(layer?' '+layer:'')+(cls?' '+cls:''),parent);n.style.transform=`translate3d(${x}px,${-y}px,${z}px)`;if(id)n.dataset.id=id;return n}
function box(parent,w,h,d,color,opt={}){
  const b=el('div','cb'+(opt.cls?' '+opt.cls:''),parent);
  b.style.cssText=`width:${w}px;height:${h}px;margin:${-h/2}px 0 0 ${-w/2}px;--c:${color}`;
  const F=[['fr',`translateZ(${d/2}px)`,w,h,0,0],['bk',`rotateY(180deg) translateZ(${d/2}px)`,w,h,0,0],['rt',`rotateY(90deg) translateZ(${w/2}px)`,d,h,(w-d)/2,0],['lf',`rotateY(-90deg) translateZ(${w/2}px)`,d,h,(w-d)/2,0],['tp',`rotateX(90deg) translateZ(${h/2}px)`,w,d,0,(h-d)/2],['bt',`rotateX(-90deg) translateZ(${h/2}px)`,w,d,0,(h-d)/2]];
  for(const [c,t,fw,fh,l,tp] of F){el('div','f '+c,b,`left:${l}px;top:${tp}px;width:${fw}px;height:${fh}px;transform:${t}`)}
  if(opt.at){b.style.transform=`translate3d(${opt.at[0]}px,${-opt.at[1]}px,${opt.at[2]}px)`}
  return b}
function cyl(parent,r,h,color,axis='y',opt={}){
  const w=el('div','cy',parent);w.style.cssText=`width:${2*r}px;height:${h}px;margin:${-h/2}px 0 0 ${-r}px;--c:${color}`;
  const N=opt.n||12, tw=2*r*Math.tan(Math.PI/N)*1.03;
  for(let i=0;i<N;i++){const f=el('div','f',w,`left:${r-tw/2}px;top:0;width:${tw}px;height:${h}px;transform:rotateY(${i*360/N}deg) translateZ(${r}px)`);f.style.setProperty('--sd',`rgba(0,0,0,${(.42*(1-Math.cos((i*360/N)*D))/2).toFixed(2)})`);f.style.background=`linear-gradient(var(--sd),var(--sd)),var(--c)`}
  for(const s of [1,-1])el('div','f cap',w,`left:0;top:${h/2-r}px;width:${2*r}px;height:${2*r}px;transform:rotateX(${90*s}deg) translateZ(${h/2}px);--sd:rgba(255,255,255,${s>0?.12:0})`).style.background='linear-gradient(var(--sd),var(--sd)),var(--c)';
  if(axis==='x')w.style.transform='rotateZ(90deg)';else if(axis==='z')w.style.transform='rotateX(90deg)';
  if(opt.at)w.style.transform=`translate3d(${opt.at[0]}px,${-opt.at[1]}px,${opt.at[2]}px) `+(w.style.transform||'');
  return w}
function pin(n,text,dy,color){const p=el('div','pin',n,`--dy:${dy||8}px`);p.textContent=text;if(color)p.style.setProperty('--pc',color);return p}
function setSeg(sg,a,b){const dx=b[0]-a[0],dy=-(b[1]-a[1]),dz=b[2]-a[2],L=Math.hypot(dx,dy,dz)||.01,h=Math.hypot(dx,dz);
  sg.style.width=L+'px';sg.style.marginLeft=(-L/2)+'px';sg.style.transform=`translate3d(${(a[0]+b[0])/2}px,${-(a[1]+b[1])/2}px,${(a[2]+b[2])/2}px) rotateY(${Math.atan2(-dz,dx)/D}deg) rotateZ(${Math.atan2(dy,h)/D}deg)`}
function barTf(e,a,b){const dx=b[0]-a[0],dy=-(b[1]-a[1]),dz=b[2]-a[2],L=Math.hypot(dx,dy,dz)||.01,h=Math.hypot(dx,dz);
  e.style.transform=`translate3d(${(a[0]+b[0])/2}px,${-(a[1]+b[1])/2}px,${(a[2]+b[2])/2}px) rotateY(${Math.atan2(-dz,dx)/D}deg) rotateZ(${Math.atan2(dy,h)/D}deg) scaleX(${L})`}
const lerp=(a,b,t)=>a+(b-a)*t, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

/* ===== 02 · REGISTRY · registro de peças ===== */
const REG={}, wroot=node(world,0,0,0,null,''), root=node(wroot,0,0,0,null,'');
function reg(id,o){o.id=id;o.lines=o.lines||[];REG[id]=o;return o}
function comp(id,layer,x,y,z,o){const n=node(root,x,y,z,id,layer);if(o.cls)n.classList.add(...o.cls.split(' '));const r=reg(id,Object.assign({layer,pos:[x,y,z],node:n},o));if(o.code&&!o.nopin)pin(n,o.code,o.pdy||10,layer==='hyd'?'var(--hyd)':layer==='ele'?'var(--pos)':'var(--acc)');return n}
const STEEL='#5d7482', DARK='#2a363e', RUB='#1b1f22', ALU='#8fa2ad';

/* ===== 03 · LINES · mangueiras e fios ===== */
const LN={};
const LT={p:['--lc','#ff7a3d',5],t:['--lc','#4aa3ff',5],c:['--lc','#5be0a0',3],pos:['--lc','#ffd43b',2.4],sig:['--lc','#7ee081',2.2],dat:['--lc','#66e0ff',2.2],gnd:['--lc','#8a98a3',2.4]};
function line(id,type,ptsFn,layer,comps,cls){
  const g=el('div','n ln '+layer+(cls?' '+cls:''),root);g.style.setProperty('--lc',LT[type][1]);
  const pts=typeof ptsFn==='function'?ptsFn():ptsFn, th=LT[type][2], segs=[];
  for(let i=0;i<pts.length-1;i++){const s=el('div','sg',g,`height:${th}px;margin-top:${-th/2}px;margin-left:0`);el('div','fl',s);el('div','fl b',s);segs.push(s)}
  const o=LN[id]={id,type,g,segs,fn:typeof ptsFn==='function'?ptsFn:null,layer,comps:comps||[],state:''};
  upd(o,pts);(comps||[]).forEach(c=>REG[c]&&REG[c].lines.push(id));return o}
function upd(o,pts){pts=pts||o.fn();o.segs.forEach((s,i)=>setSeg(s,pts[i],pts[i+1]))}
function lineSt(id,st){const o=LN[id];if(!o||o.state===st)return;o.state=st;const c=o.g.classList;c.toggle('on',st==='f'||st==='r');c.toggle('rev',st==='r');c.toggle('live',st==='live')}

/* ===== 04 · CAMERA · câmera, vistas e entrada de ponteiro ===== */
const cam={rx:-24,ry:-38,zoom:.82,tx:0,ty:60,tz:0,panx:0,pany:0};
const tgt={...cam};
const VIEWS={iso:{rx:-24,ry:-38,z:1.3},side:{rx:-4,ry:0,z:1.1},top:{rx:-88,ry:0,z:1.5},front:{rx:-6,ry:-90,z:1.9}};
let stageW=stage.clientWidth||820;                       /* largura em cache (sem ler layout no loop) */
if('ResizeObserver' in window)new ResizeObserver(es=>{stageW=es[0].contentRect.width||stageW}).observe(stage);
const bz=()=>Math.min(1,stageW/820);
const camLast={};let zsLast='';
function applyCam(){                                      /* só escreve no DOM se a câmera mudou */
  const c=cam;let rot=c.rx!==camLast.rx||c.ry!==camLast.ry;
  if(!rot&&c.panx===camLast.panx&&c.pany===camLast.pany&&c.zoom===camLast.zoom&&c.tx===camLast.tx&&c.ty===camLast.ty&&c.tz===camLast.tz)return;
  for(const k of CAMK)camLast[k]=c[k];
  world.style.transform=`translate(${c.panx}px,${c.pany}px) scale(${c.zoom}) rotateX(${c.rx}deg) rotateY(${c.ry}deg) translate3d(${-c.tx}px,${c.ty}px,${-c.tz}px)`;
  if(rot){stage.style.setProperty('--rx',c.rx+'deg');stage.style.setProperty('--ry',c.ry+'deg')}
  const zs=clamp(1.05/c.zoom,.42,1.3).toFixed(3);if(zs!==zsLast){zsLast=zs;stage.style.setProperty('--zs',zs)}}

function focusOn(p,zoom){tgt.tx=p[0];tgt.ty=p[1];tgt.tz=p[2];if(zoom)tgt.zoom=zoom}
let autoZ=true,lastAutoZ=0,curView='iso',stageH=stage.clientHeight||700;
if('ResizeObserver' in window)new ResizeObserver(es=>{stageH=es[0].contentRect.height||stageH}).observe(stage);
const fitZ=()=>{const h=(typeof platTop==='function'?platTop():300)+170;return clamp(.8*stageH/h,.3,1.45)/1.45};   /* enquadra a máquina inteira, de 3 a 5 níveis */
function view(v){const V=VIEWS[v];curView=v;autoZ=true;tgt.rx=V.rx;tgt.ry=V.ry;tgt.zoom=lastAutoZ=V.z*bz()*fitZ();tgt.panx=0;tgt.pany=0;tgt.tx=0;tgt.ty=autoTy();tgt.tz=0}
const autoTy=()=>(typeof platTop==='function'?platTop():300)*.46+60;
/* entrada de ponteiro. Em toque + Modo Operação a cena não gira (só toque simples seleciona), então o dedo
   pode rolar a página e usar o joystick sem disputar o gesto. Inércia suave ao soltar. */
let ptrs=new Map(), moved=0, pinch=0, lastT=0, tap=null;
const vel={x:0,y:0};
const CAMK=['rx','ry','zoom','tx','ty','tz','panx','pany'];
const UI_HIT='.tools,.diag,.tmode,.opad';
const camGesture=e=>Touch.cam()||e.pointerType!=='touch';
const pickAt=(x,y)=>{const t=document.elementFromPoint(x,y);const n=t&&t.closest('[data-id]');if(n)select(n.dataset.id,true)};
stage.addEventListener('pointerdown',e=>{
  if(e.target.closest(UI_HIT))return;
  if(!camGesture(e)){tap={id:e.pointerId,x:e.clientX,y:e.clientY,t:e.timeStamp};return}
  try{stage.setPointerCapture(e.pointerId)}catch(_){}
  ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});moved=0;vel.x=vel.y=0;lastT=e.timeStamp;stage.classList.add('drag');
  if(ptrs.size===2){const [a,b]=[...ptrs.values()];pinch=Math.hypot(a.x-b.x,a.y-b.y)}});
stage.addEventListener('pointermove',e=>{if(!ptrs.has(e.pointerId))return;const p=ptrs.get(e.pointerId);
  if(ptrs.size===2){p.x=e.clientX;p.y=e.clientY;const [a,b]=[...ptrs.values()],d=Math.hypot(a.x-b.x,a.y-b.y);if(pinch){tgt.zoom=clamp(tgt.zoom*d/pinch,.2,4);cam.zoom=tgt.zoom}pinch=d;moved=99;vel.x=vel.y=0;applyCam();return}
  const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;moved+=Math.abs(dx)+Math.abs(dy);
  const dtm=Math.max(1,e.timeStamp-lastT);lastT=e.timeStamp;
  if(e.shiftKey||e.buttons===2){tgt.panx+=dx;tgt.pany+=dy;cam.panx=tgt.panx;cam.pany=tgt.pany;vel.x=vel.y=0}
  else{tgt.ry+=dx*.45;tgt.rx=clamp(tgt.rx-dy*.35,-90,8);cam.ry=tgt.ry;cam.rx=tgt.rx;
    vel.x=lerp(vel.x,dx*.45/dtm*1000,.5);vel.y=lerp(vel.y,-dy*.35/dtm*1000,.5)}
  applyCam()});
const endP=e=>{ptrs.delete(e.pointerId);pinch=0;if(!ptrs.size)stage.classList.remove('drag')};
stage.addEventListener('pointerup',e=>{
  if(tap&&tap.id===e.pointerId){const ok=Math.hypot(e.clientX-tap.x,e.clientY-tap.y)<10&&e.timeStamp-tap.t<500;tap=null;if(ok&&!e.target.closest(UI_HIT))pickAt(e.clientX,e.clientY);return}
  const was=moved<5&&ptrs.size===1;if(e.timeStamp-lastT>80)vel.x=vel.y=0;endP(e);if(was){vel.x=vel.y=0;pickAt(e.clientX,e.clientY)}});
stage.addEventListener('pointercancel',e=>{tap=null;vel.x=vel.y=0;endP(e)});
stage.addEventListener('contextmenu',e=>e.preventDefault());
stage.addEventListener('wheel',e=>{e.preventDefault();tgt.zoom=clamp(tgt.zoom*Math.exp(-e.deltaY*.0012),.2,4)},{passive:false});
/* câmera pelo teclado (palco com foco): Shift+setas gira, + e − aproximam, 0 recentraliza */
stage.addEventListener('keydown',e=>{
  if(e.shiftKey&&e.key.startsWith('Arrow')){e.preventDefault();tgt.ry+=(e.key==='ArrowRight'?8:e.key==='ArrowLeft'?-8:0);tgt.rx=clamp(tgt.rx+(e.key==='ArrowUp'?6:e.key==='ArrowDown'?-6:0),-90,8)}
  else if(e.key==='+'||e.key==='=')tgt.zoom=clamp(tgt.zoom*1.2,.2,4);
  else if(e.key==='-'||e.key==='_')tgt.zoom=clamp(tgt.zoom/1.2,.2,4);
  else if(e.key==='0')view('iso')});
$('#zIn').onclick=()=>tgt.zoom=clamp(tgt.zoom*1.25,.2,4);$('#zOut').onclick=()=>tgt.zoom=clamp(tgt.zoom/1.25,.2,4);
$('#zReset').onclick=()=>{if(S.sel&&REG[S.sel])REG[S.sel].node.classList.remove('sel');S.sel=null;renderInfo();view('iso');A11y.say('Vista recentralizada')};


/* ===== 05 · STATE · estado da simulação ===== */
const S={model:'3246',oext:0,lev:0,eos:false,roll:0,pitch:0,key:'off',estop:false,qd1:true,mode:'lift',torque:false,u:0,steer:0,speedx:5,fault:null,tilt:false,held:{up:0,down:0,left:0,right:0,oen:0,oex:0,ore:0},
  v:0,wheel:0,psi:0,px:0,pz:0,P:0,V:25.4,out:{},pump:false,mspin:0,flash:0,sel:null};
const GEO={Ln:315,n:5,x0:-170,y0:78,th0:3.5,th1:60};   /* 147 px ≈ 1 m; Ln e n por modelo vêm do manual de peças (3, 4 e 5 níveis) */

/* ===== 06 · MACHINE · construção da máquina (chassi, hidráulica, elétrica, tesoura, estabilizadores) ===== */
const ground=el('div','ground',wroot);const gw=el('div','n',ground);const gp=el('div','gp',gw);
/* chassi */
const chassis=node(root,0,0,0,'CHASSI','mec shell');
box(chassis,380,6,150,'#3b4d58',{cls:'dbl',at:[0,21,0]});
box(chassis,6,44,150,'#4a6070',{cls:'dbl',at:[-187,46,0]});box(chassis,6,44,150,'#4a6070',{cls:'dbl',at:[187,46,0]});
box(chassis,380,44,6,'#4a6070',{cls:'dbl',at:[0,46,72]});box(chassis,380,44,6,'#4a6070',{cls:'dbl',at:[0,46,-72]});
box(chassis,380,4,150,'#566b78',{cls:'dbl',at:[0,70,0]});
/* para-lamas sobre as rodas */
for(const x of [-150,150])for(const z of [91,-91]){box(chassis,76,4,30,'#4a6070',{cls:'dbl',at:[x,64,z]});box(chassis,76,22,3,'#3f5360',{cls:'dbl',at:[x,52,z+(z>0?15:-15)]})}
/* portas de acesso nas laterais (lado das baterias e lado da hidráulica) com trinco */
for(const [z,sg] of [[75.5,1],[-75.5,-1]]){box(chassis,150,36,2,'#566b78',{cls:'dbl',at:[-5,46,z]});box(chassis,150,2.5,3,'#2a363e',{cls:'dbl',at:[-5,29,z+sg*.5]});cyl(chassis,3.5,6,'#c9d3d8','z',{at:[56,46,z+sg*3],n:8});box(chassis,48,14,3,'#232d33',{cls:'dbl',at:[-165+30,42,z+sg*.3]})}
/* nariz: painel inclinado na frente (lado da direção) e para-choque traseiro com olhais de amarração */
{const nz=node(chassis,196,48,0,null,'');nz.style.transform+=' rotateZ(-14deg)';box(nz,8,44,150,'#566b78',{cls:'dbl'})}
box(chassis,8,38,150,'#4a6070',{cls:'dbl',at:[-196,46,0]});
for(const z of [60,-60]){box(chassis,14,6,18,'#c9a227',{cls:'dbl',at:[-203,56,z]})}
reg('CHASSI',{layer:'mec',name:'Chassi e carcaça',code:'CHASSI',pos:[0,40,0],node:chassis,lines:[],
  desc:'Estrutura que suporta a tesoura, o conjunto hidráulico, as baterias e os eixos. A porta de inspeção do lado dos controles de solo dá acesso ao distribuidor de funções. Use "Raio-X" para ver tudo por dentro.',
  specs:[['Pneus (GS-3246)','38,1 x 12,7 cm, borracha maciça'],['Área de contato do pneu','96,7 cm²'],['Torque da porca castelo, seca','406,7 Nm'],['Torque da porca castelo, lubrificada','305 Nm'],['Capacidade de subida','25%'],['Ruído no ar','< 70 dB'],['Carga nominal na altura máxima','317 kg']]});
/* rodas */
function wheel(parent,R,W){const sp=el('div','n',parent);const N=14,tw=2*Math.PI*R/N*1.05;
  for(let i=0;i<N;i++){const s=el('div','cb nb',sp,`width:${tw}px;height:${W}px;margin:${-W/2}px 0 0 ${-tw/2}px;transform:rotateZ(${i*360/N}deg) translateY(${-R}px) rotateX(90deg)`);const f=el('div','f fr',s,`left:0;top:0;width:${tw}px;height:${W}px`);f.style.setProperty('--c',i%2?'#242a2e':'#1b2023');f.style.setProperty('backface-visibility','visible')}
  for(const z of [W/2,-W/2]){const c=el('div','f cap',sp,`left:${-(R-3)}px;top:${-(R-3)}px;width:${2*(R-3)}px;height:${2*(R-3)}px;transform:translateZ(${z}px);--c:#3a454c;backface-visibility:visible`);c.style.background='radial-gradient(circle,#8fa2ad 0 22%,#3a454c 24% 100%)';const m=el('div','f',sp,`left:${-R*.7}px;top:-2.5px;width:${R*1.4}px;height:5px;transform:translateZ(${z*1.02}px);--c:#ffd43b;background:#ffd43b;backface-visibility:visible`)}
  for(const z of [W/2+1,-W/2-1]){const sg=z>0?1:-1;
    cyl(sp,7,5,'#8a969d','z',{at:[0,0,sg*(W/2+3)],n:8});                               /* porca castelo */
    box(sp,2,2,8,'#ffd43b',{at:[0,0,sg*(W/2+4)]});                                    /* contrapino */
    for(let i=0;i<6;i++){const a=i*60*D;box(sp,3.5,3.5,3,'#59666d',{at:[Math.cos(a)*14,Math.sin(a)*14,sg*(W/2+2)]})}}   /* parafusos do cubo */
  return sp}
const wheels={};
for(const [nm,x,steer] of [['R',-150,0],['F',150,1]])for(const z of [91,-91]){
  const g=node(root,x,30,z,steer?'EIXO_DIR':'EIXO_TRAS','mec');const st=el('div','n',g);wheels[nm+z]={st,sp:wheel(st,30,24),steer}}
reg('EIXO_DIR',{layer:'mec',name:'Eixo de direção (dianteiro)',code:'EIXO',pos:[150,30,0],lines:[],node:wheels.F91.st.parentNode,
  desc:'Eixo comandado pela direção. O cilindro de direção move a barra de acoplamento, que gira as duas rodas. As barras de acoplamento são engraxadas na inspeção A-5.',specs:[['Procedimentos no manual','8-1 barra de acoplamento, 8-2 coluna, 8-3 caixa de direção'],['Engraxe','Lista de verificação A-5']]});
reg('EIXO_TRAS',{layer:'mec',name:'Eixo traseiro de tração (não comandado)',code:'EIXO',pos:[-150,30,0],lines:[],node:wheels.R91.st.parentNode,
  desc:'Eixo não comandado pela direção. Cada roda é acionada por um motor hidráulico e tem freio de mola liberado por pressão.',specs:[['Procedimento no manual','9-1 Freio da máquina'],['Teste de frenagem','Lista de verificação B-7'],['Distância de frenagem','61 cm ± 30 cm (pavimento)']]});
/* vigas do eixo dianteiro e barra de direção */
const axleF=node(root,0,0,0,'EIXO_DIR','mec');box(axleF,12,12,170,'#445661',{at:[158,30,0]});
const tie=box(axleF,6,6,120,'#9fb0b9',{at:[143,30,0]});
const axleR=node(root,0,0,0,'EIXO_TRAS','mec');box(axleR,12,12,170,'#445661',{at:[-166,30,0]});

/* reservatório e componentes hidráulicos */
let n;
n=comp('TANK','hyd',-100,42,40,{name:'Tanque de óleo hidráulico',code:'TANQUE',desc:'Armazena o óleo. A bomba aspira por ele e todo o retorno passa pelo filtro antes de voltar. A tampa tem respiro que deve ser inspecionado.',
  specs:[['Capacidade do tanque','14,2 litros'],['Sistema completo','19 litros (GS-3246)'],['Óleo','Equivalente a Chevron Rando HD, multiviscosidade'],['Índice de viscosidade','200'],['Limpeza mínima','15/13'],['Água máx.','200 ppm'],['Inspeções','B-11 análise do óleo, B-12 respiro, E-1 troca']]});
box(n,64,34,42,'#2f6f8f',{cls:''});box(n,12,5,12,'#cfd8dc',{at:[18,19,0]});
n=comp('FILTER','hyd',-52,37,26,{name:'Filtro de retorno',code:'FILTRO',desc:'Filtra todo o óleo que volta ao tanque. Possui derivação (bypass) caso o elemento fique saturado.',
  specs:[['Filtragem','10 mícrons'],['Derivação (bypass)','1,7 bar (25 psi)'],['Troca do elemento','Lista de verificação D-2']]});cyl(n,9,26,'#c9a227','y');
n=comp('M5','hyd',-5,42,42,{name:'Unidade de propulsão (motor M5 + bomba)',code:'M5',desc:'Motor elétrico de 24 V CC que aciona a bomba de controle. O controlador U6 liga o motor sempre que uma função precisa de óleo: subir, andar ou esterçar. Para descer, o motor não gira.',
  specs:[['Alimentação','Controlador U6 (terminais B+ e B-)'],['Bomba','Engrenagem, 4 cm³ por rotação'],['Vazão','15 L/min a 172 bar'],['Relé de corte','Fios preto e branco cortam a alimentação do controlador quando o carregador está conectado']]});
cyl(n,14,50,'#3a4a55','x');const mrot=el('div','n',n);box(mrot,4,6,22,'#ffd43b',{at:[0,15,0]});
n=comp('PUMP','hyd',34,42,42,{name:'Bomba de controle',code:'BOMBA',desc:'Bomba de engrenagens acoplada ao motor M5. Entrega óleo ao distribuidor de funções (porta P).',
  specs:[['Tipo','Engrenagem'],['Deslocamento','4 cm³ por revolução'],['Vazão','15 L/min a 172 bar'],['Procedimento no manual','5-1 Bomba de controle']]});cyl(n,9,22,'#7a8c97','x');
n=comp('MANIFOLD','hyd',100,40,40,{name:'Distribuidor de funções',code:'DIST',desc:'Bloco de válvulas atrás da porta de inspeção, no lado dos controles de solo. Concentra segurança do sistema, elevação, direção, tração e controle do freio. As letras são os itens do esquema hidráulico.',
  specs:[['AA','Conexão para diagnóstico (testes)'],['AB','Válvula de segurança do sistema, 255 bar máx. (27 Nm)'],['AC','3 posições, 4 vias: virar esq./dir. (Y3, Y4) (34 Nm)'],['AD','Disco de verificação: circuito da direção (24 Nm)'],['AE','2 posições, 4 vias: seleção de velocidade (Y1) (34 Nm)'],['AF','Válvula de segurança do freio, 3,4 bar (27 Nm)'],['AG','3 posições, 5 vias: avanço/ré (Y6, Y5) (34 Nm)'],['AH','Reguladora de vazão e segurança, 2,8 L/min, 103 bar (35 Nm)'],['AI','2 posições, 4 vias: elevação da plataforma (Y8) (34 Nm)'],['AJ','Válvula de segurança de elevação, 124 a 255 bar (27 Nm)'],['Porca da bobina AC','5 a 7 Nm'],['Porcas da bobina AE, AG, AI','7 a 9 Nm']],
  src:'Manual, seção 4-6.2 (pág. 4-90) e esquema 6-92'});box(n,70,30,40,'#4c7a48');
n=comp('ACC','hyd',156,41,50,{name:'Acumulador',code:'P',desc:'Acumulador de 78 cm³ (4,75 pol³) ligado à linha de pressão da direção e do freio. Amortece picos e mantém pressão disponível.',specs:[['Volume','78 cm³ (4,75 pol³)']]});cyl(n,9,34,'#b44d2a','y');
n=comp('BRK_MAN','hyd',-140,36,0,{name:'Distribuidor de liberação do freio e bomba manual',code:'FREIO',desc:'Permite soltar os freios das rodas de tração com uma bomba manual, para rebocar a máquina sem energia. O freio é de mola e só solta com pressão.',
  specs:[['Pressão de liberação (esquema)','26 a 31 bar (370 a 450 psi)'],['Procedimento no manual','10-1 Bomba manual de comando do freio']]});box(n,36,22,30,'#6b5a8e');cyl(n,5,16,'#d6d6d6','y',{at:[0,19,0]});
n=comp('BRK_L','hyd',-150,30,45,{name:'Freio da roda esquerda',code:'FREIO E',desc:'Freio de mola, aplicado por padrão. Quando a máquina anda, a pressão controlada pela válvula AF (3,4 bar) solta o freio.',specs:[['Teste','Lista de verificação B-7'],['Procedimento no manual','9-1 Freio da máquina']]});cyl(n,19,7,'#a3472f','z');
n=comp('BRK_R','hyd',-150,30,-45,{name:'Freio da roda direita',code:'FREIO D',desc:'Freio de mola, aplicado por padrão. Solta com pressão quando a máquina anda.',specs:[['Teste','Lista de verificação B-7']]});cyl(n,19,7,'#a3472f','z');
n=comp('DRV_L','hyd',-150,30,62,{name:'Motor de acionamento esquerdo',code:'MOTOR E',desc:'Motor hidráulico bidirecional. Gira para frente ou para trás conforme o lado do distribuidor que recebe pressão (Y6 avanço, Y5 ré).',specs:[['Tipo','Bidirecional'],['Seleção de velocidade','Válvula AE com bobina Y1 (paralelo)'],['Procedimento no manual','8-1 Barra de acoplamento e motor de acionamento']]});cyl(n,14,30,'#3c4d58','z');
n=comp('DRV_R','hyd',-150,30,-62,{name:'Motor de acionamento direito',code:'MOTOR D',desc:'Motor hidráulico bidirecional da roda direita. Recebe o mesmo comando de avanço e ré.',specs:[['Tipo','Bidirecional']]});cyl(n,14,30,'#3c4d58','z');
n=comp('STEER_CYL','hyd',138,30,0,{name:'Cilindro de direção',code:'DIREÇÃO',desc:'Move a barra de acoplamento para esterçar as rodas dianteiras. É alimentado pela válvula AC (Y3 direita, Y4 esquerda) através do regulador AH.',
  specs:[['Regulador AH','2,8 L/min, 103 bar'],['Válvula de segurança da direção','103 bar'],['Bobina Y3','Giro à direita'],['Bobina Y4','Giro à esquerda']]});cyl(n,7,60,'#8c9ba5','z');
/* bobinas */
const coils={Y8:[74,30,'AI Elevação da plataforma','A6','2 posições, 4 vias (AI)','19 Ω'],Y4:[87,30,'AC Giro à esquerda','B7','3 posições, 4 vias (AC)','27,2 Ω'],Y3:[99,30,'AC Giro à direita','C7','3 posições, 4 vias (AC)','27,2 Ω'],Y1:[111,30,'AE Paralelo (torque alto)','C8','2 posições, 4 vias (AE)','19 Ω'],Y6:[123,30,'AG Avanço','C6','3 posições, 5 vias (AG)','19 Ω'],Y5:[123,48,'AG Marcha a ré','A7','3 posições, 5 vias (AG)','19 Ω']};
const COILN={Y8:'Bobina de subida da plataforma',Y4:'Bobina de giro à esquerda',Y3:'Bobina de giro à direita',Y1:'Bobina paralela (série/paralelo)',Y6:'Bobina de avanço',Y5:'Bobina de marcha à ré'};
for(const k in coils){const c=coils[k];n=comp(k,'ele',c[0],62,c[1],{name:COILN[k],code:k,pdy:6,desc:`Bobina solenoide de 20 V CC com diodo, montada sobre a válvula ${c[2].split(' ')[0]} do distribuidor. O ECM energiza pelo pino ${c[3]}. Quando energizada, desloca o carretel e libera o caminho do óleo.`,
  specs:[['Válvula','AC'===c[2].split(' ')[0]?'AC, '+c[4]:c[2].split(' ')[0]+', '+c[4]],['Função',c[2].slice(c[2].indexOf(' ')+1)],['Pino do ECM',c[3]],['Resistência a 20 °C',c[5]],['Defeito',{Y6:'Código 52',Y5:'Código 53',Y8:'Código 54',Y3:'Código 56',Y4:'Código 57',Y1:'Código 59'}[k]]]});
  box(n,9,14,9,'#2d2d2d');box(n,11,3,11,'#ffd43b',{at:[0,8,0]})}
/* cilindros de elevação (dinâmicos) */
const LIFT={B:[-110,72,0]};
const liftBody=node(root,0,0,0,'LIFT_CYL','hyd');const lb=box(liftBody,1,15,15,'#7d8f9a',{cls:'nb'});const lr=box(liftBody,1,7,7,'#cfd8dc',{cls:'nb'});
const liftTube=node(root,0,0,0,'LIFT_CYL','mec');box(liftTube,10,9,126,'#6a7c87');
const upBody=node(root,0,0,0,'UP_CYL','hyd');const ub=box(upBody,1,13,13,'#7d8f9a',{cls:'nb'});const ur=box(upBody,1,6,6,'#cfd8dc',{cls:'nb'});
const upT1=node(root,0,0,0,'UP_CYL','mec'),upT2=node(root,0,0,0,'UP_CYL','mec');[upBody,upT1,upT2].forEach(n=>n.classList.add('oup'));box(upT1,8,8,126,'#6a7c87');box(upT2,8,8,126,'#6a7c87');
reg('LIFT_CYL',{layer:'hyd',name:'Cilindro de elevação',code:'ELEV',pos:[-90,100,0],node:liftBody,lines:[],desc:'Empurra a tesoura para cima. A válvula Y7 (2 posições, 2 vias, normalmente fechada) fica no cilindro e mantém a carga quando não há comando. Para descer, a Y7 abre e o óleo sai pelo orifício calibrado.',
  specs:[['Presente em','Todos os modelos'],['Bobina','Y7, descida da plataforma (25 Ω)'],['Orifício na válvula','0,94 mm (0,037 pol)'],['Orifício na mangueira','1,5 mm (0,059 pol)'],['Procedimento no manual','3-6 Cilindro de elevação']]});
reg('UP_CYL',{cls:'oup',layer:'hyd',name:'Cilindro de elevação superior (GS-3246)',code:'ELEV 2',pos:[-30,150,0],node:upBody,lines:[],desc:'Segundo cilindro de elevação, presente nos modelos GS-3232 e GS-3246. Tem válvula própria (Y9) e válvula de segurança.',
  specs:[['Bobina','Y9, descida da plataforma (GS-3246)'],['Válvula de segurança (Q)','172 bar máx. (2500 psi)'],['Orifício','0,94 mm (0,037 pol)']]});
const Y7n=comp('Y7','ele',-110,86,6,{name:'Bobina de descida da plataforma',code:'Y7',pdy:6,desc:'Abre a válvula normalmente fechada do cilindro de elevação para a plataforma descer. O ECM energiza pelo pino B6.',specs:[['Válvula','2 posições, 2 vias, NF (item N)'],['Pino do ECM','B6'],['Resistência a 20 °C','25 Ω'],['Defeito','Código 55']]});box(Y7n,9,14,9,'#2d2d2d');box(Y7n,11,3,11,'#ffd43b',{at:[0,8,0]});
const Y9n=comp('Y9','ele',0,0,0,{cls:'oup',name:'Bobina de descida do cilindro superior (Y9)',code:'Y9',pdy:6,desc:'Faz o mesmo papel da Y7 no cilindro superior. Existe nos modelos GS-3232 e GS-3246.',specs:[['Válvula','2 posições, 2 vias, NF (item N)'],['Resistência a 20 °C','25 Ω']]});box(Y9n,9,14,9,'#2d2d2d');box(Y9n,11,3,11,'#ffd43b',{at:[0,8,0]});

/* ---------- elétrico ---------- */
const bat=comp('B5','ele',-72,39,-45,{name:'Baterias (4 × 6 V)',code:'B5',desc:'Quatro baterias de 6 V ligadas em série dão os 24 V CC da máquina. A bateria alimenta o controlador do motor, o ECM e as bobinas.',
  specs:[['Tensão','6 V CC cada, 24 V CC em série'],['Grupo / tipo','GC2 / T-105'],['Capacidade máx.','225 AH'],['Reserva a 25 A','447 minutos'],['Peso','28 kg cada'],['Opcional AGM','6 V, 200 AH, 380 min'],['Inspeção','Lista de verificação B-1']]});
const batBoxes=[-63,-21,21,63].map(x=>{const b=box(bat,38,30,30,'#2a5d3a',{at:[x,0,0]});box(bat,8,5,8,'#d0d0d0',{at:[x+10,17,0]});box(bat,8,5,8,'#d0d0d0',{at:[x-10,17,0]});return b});
box(comp('QD1','ele',-170,40,-45,{name:'Desconexão rápida da bateria',code:'QD1',desc:'Conector que interrompe a alimentação geral. Desconectar antes de qualquer manutenção elétrica.',specs:[['Polos','QD1 (+) e QD1 (-)']]}),14,14,18,'#c0392b');
n=comp('F6','ele',6,62,-38,{name:'Fusível de 275 A',code:'F6',desc:'Protege o circuito de potência entre bateria e controlador do motor.',specs:[['Corrente','275 A']]});box(n,18,10,10,'#e67e22');
n=comp('U6','ele',30,39,-45,{name:'Controlador do motor',code:'U6',desc:'Recebe 24 V pelos terminais B+ e B-, e alimenta o motor M5 quando o ECM pede. Os terminais 1 e 3 recebem os sinais do ECM (A8 e A9). Fios preto e branco cortam a alimentação quando o carregador está ligado.',
  specs:[['Entradas do ECM','Pino A8 (terminal 1), pino A9 (terminal 3)'],['Saída','Motor M5'],['Opcional','Inversor de tensão U13 (não mostrado)']]});box(n,40,30,30,'#2c3f6d');box(n,30,6,3,'#9fb3d9',{at:[0,6,16]});
n=comp('U9','ele',85,39,-45,{name:'Carregador de bateria',code:'U9',desc:'Carrega o banco de baterias a partir da tomada CA. Enquanto está conectado, o controlador do motor fica sem alimentação.',specs:[['Entrada','CA externa'],['Saída','24 V CC']]});box(n,50,30,34,'#3f5a4a');
n=comp('CR_BLOCK','ele',135,38,-40,{name:'Relés de sobrecarga e corte (modelos CE)',code:'CR',desc:'Nos modelos CE: CR28 (corte do motor), CR27A a CR27D (sobrecarga), CR48 (relé de potência do U5 para parada de emergência), resistor R24 de 25 Ω e capacitor C5 de 4700 µF.',specs:[['CR28','Corte do motor'],['CR27A','Sobrecarga, controlador do motor'],['CR27B','Sobrecarga, detector de carga'],['CR27C','Sobrecarga, bobina de descida'],['CR27D','Sobrecarga, atraso na descida'],['CR48','Relé de potência para U5 (parada de emergência)'],['R24','25 Ω'],['C5','4700 µF'],['PS2 (opcional)','Pressostato de sobrecarga da plataforma']]});box(n,40,24,30,'#6d5c2c');
n=comp('CB2','ele',62,60,-20,{name:'Disjuntor de 7 A',code:'CB2',desc:'Protege o circuito de comando (ECM, chave e botões).',specs:[['Corrente','7 A']]});box(n,12,14,10,'#b8860b');
/* caixa de controles de solo */
const gb=comp('GRD_BOX','mec',35,48,86,{name:'Caixa de controles de solo',code:'SOLO',desc:'Fica do lado externo do chassi. Reúne a chave de comando, a parada de emergência, a chave de subida/descida, o horímetro e o ECM.',specs:[['Itens','KS1, P1, TS66, G6, U5']]});box(gb,100,56,22,'#2c3a44',{cls:'dbl',at:[0,0,0]}).querySelectorAll('.f').forEach(f=>f.style.opacity=.3);
n=comp('U5','ele',35,40,84,{name:'Módulo eletrônico de controle (ECM)',code:'U5',desc:'Cérebro da máquina. Lê chave, botões, joystick, sensor de nível e chaves limitadoras, e comanda as bobinas, o alarme e o controlador do motor. Fala com a plataforma por link de dados (B1 e C1).',
  specs:[['A1','Sinalizador pisca-pisca FB'],['A5 / C11','Alimentação e sinal do sensor de nível S7'],['A6','Bobina de subida Y8'],['A7','Bobina de ré Y5'],['A8 / A9','Controlador do motor U6'],['A10','Pressostato PS2 (opcional)'],['A11','Chave de comando KS1'],['A12 / B12','Descida / subida TS66'],['B1 / C1','Link de dados da plataforma'],['B6','Bobina de descida Y7'],['B7','Bobina de giro à esquerda Y4'],['B8','Buzina H2 (opcional)'],['B9','Alarme multifunção H5'],['B10','Chave limitadora da patola de proteção'],['B11','Habilitação do movimento / chave limitadora de subida'],['C6','Bobina de avanço Y6'],['C7','Bobina de giro à direita Y3'],['C8','Bobina paralela Y1'],['C9','Lâmpada de trabalho L30 (opcional)'],['C12','Chave limitadora de descida LS6']],src:'Manual, legenda de pinagem do ECM (pág. 6-4)'});box(n,40,28,8,'#1f6a4f');
n=comp('KS1','ele',12,50,99,{name:'Chave de comando',code:'KS1',desc:'Seleciona entre desligado, controles de solo e controles da plataforma.',specs:[['Posições','Desligado / Solo / Plataforma']]});cyl(n,6,8,'#e0e0e0','z');box(n,3,10,3,'#222',{at:[0,0,5]});
n=comp('P1','ele',35,50,99,{name:'Botão de parada de emergência',code:'P1',desc:'Corta a alimentação de comando. Há um botão nos controles de solo (P1) e outro na plataforma (P2). Teste na inspeção B-4.',specs:[['P1','Controles de solo'],['P2','Controles da plataforma'],['Inspeção','Lista de verificação B-4']]});cyl(n,9,8,'#d63031','z');
n=comp('TS66','ele',58,50,99,{name:'Chave de subida/descida do chassi',code:'TS66',desc:'Sobe ou desce a plataforma pelos controles de solo. O ECM lê subida no pino B12 e descida no pino A12.',specs:[['Subida','Pino B12'],['Descida','Pino A12'],['Defeito','Código 12']]});box(n,18,8,8,'#555');box(n,5,12,5,'#ddd',{at:[0,0,6]});
n=comp('G6','ele',78,40,99,{name:'Horímetro',code:'G6',desc:'Conta as horas de funcionamento da máquina.',specs:[['Tipo','Horímetro']]});box(n,18,12,6,'#101515');
/* sensores e alarmes */
n=comp('S7','ele',-20,29,0,{name:'Sensor de nível (inclinação)',code:'S7',desc:'Detecta inclinação do chassi. Se passar do limite, o ECM mostra o código LL e soa o alarme. O ECM alimenta o sensor pelo pino A5 e lê o sinal no pino C11.',specs:[['Alimentação','Pino A5'],['Sinal','Pino C11'],['Código','LL'],['Procedimento no manual','4-2 Sensores de nível']]});box(n,20,8,20,'#c24c2f');
n=comp('LS6','ele',-130,73,-45,{name:'Chave limitadora de descida',code:'LS6',desc:'Informa ao ECM que a tesoura está totalmente abaixada. O ECM lê no pino C12.',specs:[['Pino do ECM','C12'],['Teste','Lista de verificação B-15'],['Defeito','Código 19']]});box(n,12,8,12,'#2f9e44');
const guard=[];
for(const [x,dir] of [[-50,1],[50,-1]]){const g=node(root,x,17,0,'PATOLA','mec');const arm=el('div','n',g);box(arm,16,5,110,'#d9a21b',{at:[dir*9,0,0]});guard.push({arm,dir});
  const s=comp(dir>0?'LS7':'LS8','ele',x,22,0,{name:'Chave da patola de proteção '+(dir>0?'(LS7)':'(LS8)'),code:dir>0?'LS7':'LS8',desc:'As patolas de proteção descem quando a plataforma sobe, para evitar queda em buracos. Estas chaves normalmente fechadas informam ao ECM que a patola está no lugar. O ECM lê no pino B10.',specs:[['Tipo','Normalmente fechada, mantida aberta (NCHO)'],['Pino do ECM','B10'],['Teste','Lista de verificação B-15'],['Defeito','Código 18']]});box(s,12,8,12,'#d63031')}
reg('PATOLA',{layer:'mec',name:'Patolas de proteção contra buracos',code:'PATOLA',pos:[0,17,0],node:guard[0].arm,lines:[],desc:'Barras sob o chassi que descem quando a tesoura sobe. Se algo impede a patola de descer ou subir, o ECM acusa o código 18.',specs:[['Chaves','LS7 e LS8'],['Teste','Lista de verificação B-15']]});
n=comp('H5','ele',172,40,-12,{name:'Alarme multifunção',code:'H5',desc:'Soa na descida, em inclinação e em falhas. Ligado ao pino B9 do ECM.',specs:[['Pino do ECM','B9']]});box(n,16,12,16,'#c27c2f');
n=comp('FB','ele',-180,80,0,{name:'Sinalizadores pisca-pisca (opcional)',code:'FB',desc:'Luzes de advertência no chassi, comandadas pelo pino A1 do ECM.',specs:[['Pino do ECM','A1']]});box(n,12,12,12,'#ff9f1c',{at:[0,0,40]});box(n,12,12,12,'#ff9f1c',{at:[0,0,-40]});
const platFx={ext:null,extR:null,gate:null,e:0,g:0,eT:0,gT:0};
/* tesoura */
const arms=[];
const MAXN=5;   /* constrói 5 níveis; o modelo escolhe quantos aparecem */
for(let i=0;i<MAXN;i++)for(const s of [1,-1]){for(const k of ['A','B']){const nd=node(root,0,0,0,'TESOURA','mec');const col=k==='A'?'#c9a227':'#d4b13a';
  box(nd,GEO.Ln-16,11,7,col);                                                       /* alma */
  box(nd,GEO.Ln-16,2.5,11,'#b08f1c',{at:[0,6.2,0]});box(nd,GEO.Ln-16,2.5,11,'#b08f1c',{at:[0,-6.2,0]});   /* flanges superior e inferior */
  for(const e of [1,-1]){const b=cyl(nd,8.5,11,'#7d8b93','z',{at:[e*(GEO.Ln/2-8),0,0],n:10});b.classList.add('bush')}   /* buchas das pontas */
  box(nd,10,9,6,'#2a2f33',{at:[(k==='A'?1:-1)*GEO.Ln*.2,0,s>0?-8:8]});            /* para-choque do braço */
  arms.push({nd,i,s,k})}}
const pins=[];for(let i=0;i<MAXN;i++)for(const s of [1,-1]){const nd=node(root,0,0,0,'TESOURA','mec');cyl(nd,6.5,30,'#9fb0b9','z');cyl(nd,3,2,'#555e64','z',{at:[0,0,s*16]});pins.push({nd,i,s})}
/* tubos transversais entre os lados esquerdo e direito de cada nível */
const xtubes=[];for(let i=0;i<MAXN;i++){const nd=node(root,0,0,0,'TESOURA','mec');cyl(nd,4.5,128,'#6f7f89','z');xtubes.push({nd,i})}
/* braço de segurança (manutenção), dobrado junto ao nível 1 */
const safeArm=node(root,0,0,0,'TESOURA','mec');box(safeArm,GEO.Ln*.55,6,5,'#d63f2e');cyl(safeArm,4.5,8,'#222','z',{at:[-GEO.Ln*.27,0,0]});
/* guias de deslizamento: no chassi (base) e sob a plataforma (rolete de topo) */
const trackB=[];for(const z of [60,74])for(const sg of [1,-1])trackB.push(box(root,GEO.Ln+90,6,7,'#3b4852',{at:[GEO.x0+(GEO.Ln+90)/2-20,GEO.y0-8,sg*z]}));
reg('TESOURA',{layer:'mec',name:'Conjunto da tesoura',code:'TESOURA',pos:[-30,120,0],node:arms[0].nd,lines:[],desc:'Braços cruzados que sobem e descem. Cada nível tem dois pares de braços (esquerdo e direito) ligados por pinos longos e tubos transversais, com buchas (rolamento 66055GT), para-choques de braço e o braço de segurança de manutenção. Níveis no manual de peças: 3 no GS-2046, 4 no GS-2646 e 5 no GS-3246. Os coxins dos braços são verificados na inspeção D-1.',
  specs:[['Procedimento no manual','3-5 Conjunto da tesoura, GS-3232 e GS-3246'],['Tempo para subir','55 a 59 s'],['Tempo para descer','38 a 42 s'],['Verificar coxins','Lista de verificação D-1']]});
/* plataforma */
const plat=node(root,0,0,0,'PLATAFORMA','mec');
const RAIL='#c9d3d8',RH=156;   /* guarda-corpo a 1,06 m (156 px) */
/* piso, rodapés, faixas antiderrapantes e guias inferiores */
box(plat,330,8,170,'#6b7d88',{at:[0,4,0]});
for(const z of [-52,0,52])box(plat,300,.8,26,'#46555e',{at:[-5,8.3,z]});
for(const z of [83,-83])box(plat,330,12,3,'#9aa8b0',{at:[0,14,z]});box(plat,3,12,170,'#9aa8b0',{at:[-164,14,0]});
for(const z of [60,74])for(const sg of [1,-1])box(plat,250,6,7,'#3b4852',{at:[0,-6,sg*z]});   /* guias do deslizador */
box(plat,330,4,6,'#55656f',{at:[0,-1,0]});
/* guarda-corpo: 3 corrimões e mourões; as pontas têm cantos arredondados (cilindros) */
for(const x of [-163,-60,60,163])for(const z of [-83,83])box(plat,5,RH-8,5,RAIL,{at:[x,8+(RH-8)/2,z]});
for(const y of [RH,106,58]){box(plat,330,4.5,4.5,RAIL,{at:[0,y,83]});box(plat,330,4.5,4.5,RAIL,{at:[0,y,-83]})}
for(const y of [RH,106,58])box(plat,4.5,4.5,170,RAIL,{at:[163,y,0]});
for(const x of [163,-163])for(const z of [83,-83])cyl(plat,4,6,'#aab6bd','y',{at:[x,RH+1,z],n:8});
/* portinhola de entrada na traseira (articulada, abre para fora) */
const gate=node(plat,-166,8,-83,'PLATAFORMA','mec');
for(const y of [RH,106,58])box(gate,4.5,4.5,160,RAIL,{at:[0,y-8,83]});
for(const z of [3,163])box(gate,5,RH-8,5,RAIL,{at:[0,(RH-8)/2,z]});
box(gate,3,12,160,'#9aa8b0',{at:[0,6,83]});box(gate,6,10,6,'#d63f2e',{at:[0,RH-46,160]});box(gate,7,5,7,'#2a2f33',{at:[0,RH-18,163]});
/* extensão do piso (0,91 m): desliza sob o piso a partir da frente; os corrimões da extensão sobem quando ela sai */
const pext=node(plat,0,0,0,'PLATAFORMA','mec');
box(pext,134,8,160,'#7a8c97',{at:[98,4.9,0]});box(pext,134,.8,150,'#46555e',{at:[98,9.4,0]});
for(const x of [48,98,148])cyl(pext,5,150,'#a1aeb5','z',{at:[x,-4,0],n:8});   /* rolos de extensão */
const pextR=node(pext,0,8,0,'PLATAFORMA','mec');
for(const z of [-80,80]){for(const y of [RH,106,58])box(pextR,134,4.5,4.5,RAIL,{at:[98,y-8,z]});for(const x of [34,162])box(pextR,5,RH-8,5,RAIL,{at:[x,(RH-8)/2,z]});box(pextR,134,12,3,'#9aa8b0',{at:[98,6,z]})}
for(const y of [RH,106,58])box(pextR,4.5,4.5,160,RAIL,{at:[162,y-8,0]});box(pextR,3,12,160,'#9aa8b0',{at:[162,6,0]});
platFx.ext=pext;platFx.extR=pextR;platFx.gate=gate;
reg('PLATAFORMA',{layer:'mec',name:'Plataforma de trabalho',code:'PLAT',pos:[0,200,0],node:plat,lines:[],desc:'Local do operador. Piso com extensão deslizante de 0,91 m sobre rolos (47163GT), portinhola traseira (conjunto 96760GT), guarda-corpo de três corrimões e rodapé. Na frente fica a caixa de controle com joystick, chave de movimento e elevação, botão de emergência e a placa de circuito dos controles.',
  specs:[['Carga nominal na altura máxima','317 kg'],['Procedimentos no manual','2-1 Plataforma, 2-2 Extensão da plataforma'],['Sobrecarga (opcional)','3-7 Sistema de sobrecarga da plataforma']]});
const U3=node(plat,148,118,0,'U3','ele');REG.U3=reg('U3',{layer:'ele',name:'Caixa de controle da plataforma (placa U3)',code:'U3',pos:[0,0,0],node:U3,lines:[],desc:'A placa U3 lê joystick, botões e chaves da plataforma e envia ao ECM pelo link de dados. Os LEDs L16 (elevação) e L17 (movimento) mostram o modo escolhido.',
  specs:[['Link de dados','Pinos B1 e C1 do ECM'],['Botões','BN5 buzina, BN6 torque alto, BN8 movimento, BN9 elevação'],['Chaves','SW5 habilitação, SW6 giro esq./dir.'],['Regulador','D7 na placa'],['Defeitos','Códigos 02, 03, 42, 43, 46'],['Procedimentos','1-1 Placas de circuitos, 1-2 Regulagens, 1-3 Software']]});
box(U3,44,34,26,'#2d3b45');pin(U3,'U3',24,'var(--pos)');
const JC=node(U3,0,0,0,'JC1','ele');REG.JC1=reg('JC1',{layer:'ele',name:'Joystick',code:'JC1',pos:[0,0,0],node:JC,lines:[],desc:'Controla subida/descida ou avanço/ré conforme o modo escolhido. O potenciômetro precisa estar centrado em repouso (código 47).',specs:[['Defeito','Código 47, falha no joystick']]});
const jstick=el('div','n',JC);jstick.style.transform='translate3d(0,-22px,0)';cyl(jstick,3,22,'#111','y');cyl(jstick,6,6,'#d63031','y',{at:[0,-14,0]});
const L16=node(U3,-14,-12,14,null,'ele');box(L16,6,4,3,'#555');const L17=node(U3,14,-12,14,null,'ele');box(L17,6,4,3,'#555');
const L21=node(U3,0,-12,14,null,'ele');box(L21,6,4,3,'#555');
/* ---------- mangueiras ---------- */
const H=(id,t,pts,c,k)=>line(id,t,pts,'hyd',c,k);
H('h_suct','t',[[-68,32,50],[-62,26.5,50],[34,26.5,50],[34,26.5,42],[34,33,42]],['TANK','PUMP']);
H('h_press','p',[[34,51,42],[34,60,42],[80,60,42],[80,55,42]],['PUMP','MANIFOLD'],'o32n');
H('h_ret','t',[[95,30,20],[95,28,12],[-52,28,12],[-52,28,26],[-52,31,26]],['MANIFOLD','FILTER']);
H('h_retf','t',[[-52,50,26],[-52,64,26],[-84,64,26],[-84,59,26]],['FILTER','TANK']);
H('h_lift','p',[[115,30,20],[115,30,0],[-110,30,0],[-110,72,0]],['MANIFOLD','LIFT_CYL']);
H('h_upper','p',()=>{const a=upAnchor();return [[-110,72,6],[-95,(72+a[1])/2+30,14],[a[0]-8,a[1]+8,10],[a[0],a[1],6]]},['LIFT_CYL','UP_CYL'],'oup');
H('h_steerL','p',[[125,30,58],[125,26,44],[138,26,44],[138,30,30]],['MANIFOLD','STEER_CYL']);
H('h_steerR','p',[[130,30,58],[130,26,48],[148,26,48],[148,26,-40],[138,30,-30]],['MANIFOLD','STEER_CYL']);
H('h_dLf','p',[[75,30,60],[75,27,68],[-150,27,68],[-150,30,62]],['MANIFOLD','DRV_L']);
H('h_dLr','p',[[85,30,60],[85,28,66],[-143,28,66],[-143,30,62]],['MANIFOLD','DRV_L']);
H('h_dRf','p',[[70,30,22],[70,34,-8],[-150,34,-8],[-150,32,-14],[-150,30,-60]],['MANIFOLD','DRV_R']);
H('h_dRr','p',[[78,30,22],[78,38,-12],[-143,38,-12],[-143,32,-18],[-143,30,-60]],['MANIFOLD','DRV_R']);
H('h_brk','c',[[88,30,22],[88,31,-16],[-140,31,-16],[-140,34,-14]],['MANIFOLD','BRK_MAN']);
H('h_brkL','c',[[-140,40,10],[-140,40,44],[-150,32,44]],['BRK_MAN','BRK_L']);
H('h_brkR','c',[[-148,40,-12],[-148,40,-44],[-152,32,-44]],['BRK_MAN','BRK_R']);
H('h_acc','p',[[135,36,48],[146,36,48],[156,40,50]],['MANIFOLD','ACC']);
/* ---------- fios ---------- */
const E=(id,t,pts,c,k)=>line(id,t,pts,'ele',c,k);
E('e_bat','pos',[[-145,54,-45],[-145,60,-45],[-124,60,-45],[-124,54,-45],[-113,54,-45],[-113,60,-45],[-82,60,-45],[-82,54,-45],[-71,54,-45],[-71,60,-45],[-40,60,-45],[-40,54,-45],[-29,54,-45],[-29,60,-45],[-8,60,-45],[-8,54,-45]],['B5']);
E('e_main','pos',[[1,54,-45],[1,62,-45],[6,62,-40]],['B5','F6']);
E('e_main2','pos',[[6,62,-32],[20,62,-32],[20,54,-36]],['F6','U6']);
E('e_neg','gnd',[[-145,54,-45],[-150,50,-52],[-150,27,-66],[-170,27,-66],[-170,33,-50],[-170,27,-66],[40,27,-66],[40,36,-60]],['B5','QD1','U6']);
E('e_motor','pos',[[50,50,-45],[58,50,-45],[58,60,-45],[58,60,42],[-5,60,42],[-5,56,42]],['U6','M5']);
E('e_chg','pos',[[62,56,-60],[62,64,-60],[1,64,-60],[1,56,-52]],['U9','B5']);
E('e_ctl','sig',[[14,62,-32],[40,64,-26],[62,64,-20],[62,64,20],[50,60,70],[35,50,84]],['F6','CB2','U5']);
E('e_ctl2','sig',[[62,64,-20],[110,66,-20],[135,50,-40]],['CB2','CR_BLOCK']);
E('e_bus','sig',[[35,52,84],[35,62,72],[100,66,66],[100,66,52]],['U5','MANIFOLD']);
const COILPOS={Y8:coils.Y8,Y4:coils.Y4,Y3:coils.Y3,Y1:coils.Y1,Y6:coils.Y6,Y5:coils.Y5};
for(const k in coils){const c=coils[k];E('e_'+k,'sig',[[100,66,52],[c[0],66,c[1]-6],[c[0],62,c[1]]],['U5',k])}
E('e_Y7','sig',[[100,66,52],[100,66,10],[-110,68,10],[-110,86,6]],['U5','Y7']);
E('e_Y9','sig',()=>{const a=upAnchor();return [[-110,86,6],[-100,100,10],[a[0],a[1]+14,8]]},['Y7','Y9'],'oup');
E('e_cab','dat',()=>{const pt=platTop();return [[35,50,98],[35,40,104],[-176,40,104],[-176,pt-6,96],[pt_x()-170,pt+8,90],[pt_x()+120,pt+30,40],[pt_x()+148,pt+102,8]]},['U5','U3']);
E('e_S7','sig',[[-20,30,8],[-20,30,78],[20,40,86],[35,44,86]],['S7','U5']);
E('e_LS6','sig',[[-130,73,-45],[-130,66,-30],[-60,66,60],[20,60,80],[35,52,86]],['LS6','U5']);
E('e_LS7','sig',[[-50,22,0],[-50,28,40],[-20,40,78],[28,46,86]],['LS7','U5']);
E('e_LS8','sig',[[50,22,0],[50,28,40],[40,40,78],[42,46,86]],['LS8','U5']);
E('e_H5','sig',[[35,36,86],[60,30,60],[172,34,20],[172,36,-12]],['U5','H5']);
E('e_FB','sig',[[22,54,86],[-60,66,40],[-180,70,0],[-180,76,0]],['U5','FB']);
E('e_G6','sig',[[35,44,86],[60,44,92],[78,40,96]],['U5','G6']);

/* ===== GS-3232: estabilizadores ===== */
const OUTP={LF:[176,62],RF:[176,-62],LR:[-176,62],RR:[-176,-62]};
const OUTN={LF:'dianteiro esquerdo',RF:'dianteiro direito',LR:'traseiro esquerdo',RR:'traseiro direito'};
const OUTV={LF:['Y35','CB'],RF:['Y36','CA'],LR:['Y33','CD'],RR:['Y34','CC']},OUTT={LF:['PT1','A6'],RF:['PT2','A4'],RR:['PT3','A3'],LR:['PT4','A5']},OUTL={LF:'L51',RF:'L52',LR:'L53',RR:'L54'};
const feet={};
for(const k in OUTP){const [x,z]=OUTP[k],sx=x>0?1:-1,sz=z>0?1:-1;
  n=comp('OUT_'+k,'hyd',x,44,z,{cls:'o32',name:'Cilindro do estabilizador '+OUTN[k],code:'EST '+k,
   desc:'Estende para apoiar a máquina no solo e nivelá-la. Cada cilindro tem um bloco de válvulas: '+OUTV[k][1]+' (2 posições, 2 vias, bobina '+OUTV[k][0]+'), orifício CE de 0,94 mm na retração, retenção pilotada CF e o transdutor de pressão CG ('+OUTT[k][0]+'), que mede a carga para o autonivelamento.',
   specs:[['Bobina da válvula',OUTV[k][0]+' ('+OUTV[k][1]+')'],['Transdutor de pressão',OUTT[k][0]+' (item CG, 21,7 Nm)'],['Retenção pilotada CF','27,1 Nm'],['Orifício CE','0,94 mm, retração'],['Posição',(x>0?'Dianteiro':'Traseiro')+(x>0?', atrás das portas de inspeção dos lados das baterias e dos controles de solo':', na carcaça dos estabilizadores, na traseira')],['Procedimento no manual','11-1 Cilindro dos estabilizadores'],['Após trocar cilindro ou transdutor','Calibrar os transdutores de pressão (seção 1-4)']]});
  box(n,14,40,14,'#6f8591');const ft=el('div','n',n);box(ft,8,34,8,'#cfd8dc',{at:[0,-3,0]});box(ft,28,4,28,'#2b343a',{at:[0,-20,0]});feet[k]=ft;
  const cv=comp(OUTV[k][0],'ele',x+sx*12,44,z,{cls:'o32',name:'Bobina do estabilizador '+OUTN[k],code:OUTV[k][0],pdy:6,desc:'Abre a válvula do cilindro do estabilizador '+OUTN[k]+' durante extensão, nivelamento e retração. O ECM dos estabilizadores (U42) energiza a bobina.',specs:[['Válvula',OUTV[k][1]+', 2 posições, 2 vias'],['Resistência a 20 °C','27,2 Ω'],['Pino do U42',{LF:'C5',RF:'C6',LR:'C7',RR:'C8'}[k]],['Defeito','Lâmpada do estabilizador pisca 2 vezes em vermelho']]});box(cv,9,14,9,'#2d2d2d');box(cv,11,3,11,'#ffd43b',{at:[0,8,0]});
  const pt=comp(OUTT[k][0],'ele',x,66,z+sz*0,{cls:'o32',name:'Transdutor de pressão do estabilizador '+OUTN[k],code:OUTT[k][0],pdy:6,desc:'Mede a pressão no cilindro. O ECM usa os quatro transdutores para saber quando cada estabilizador carregou e para nivelar a máquina.',specs:[['Pino do U42',OUTT[k][1]],['Alimentação','Pino C10 do U42'],['Calibragem','Seção 1-4, após trocar transdutor ou cilindro'],['Defeito: curto ao terra ou fio solto','Lâmpada pisca 3 vezes'],['Defeito: curto na alimentação','Lâmpada pisca 4 vezes']]});box(pt,8,10,8,'#2f6fb5');}
n=comp('OUT_MAN','hyd',120,36,-8,{cls:'o32',name:'Distribuidor dos estabilizadores',code:'DIST EST',desc:'Fica atrás da porta de inspeção do lado das baterias. Recebe o óleo da bomba, estende ou retrai os quatro cilindros pela válvula BA (Y40 estende, Y39 retrai) e entrega o restante ao distribuidor de funções.',
  specs:[['BA','3 posições, 4 vias: extensão/retração (34 Nm)'],['Bobinas','Y39 retração, Y40 extensão (porcas de 5 a 7 Nm)'],['BB','Válvula de segurança, 241 bar máx. (27 Nm)'],['Entrada IN','Bomba, 0,95 L/min a 255 bar (esquema)'],['Saída OUT','Porta P do distribuidor de funções']],src:'Manual, seção 4-6.3 (pág. 4-92) e esquema 6-93'});box(n,36,22,26,'#7a5c9a');
for(const [id,x,nm,ds] of [['Y40',112,'Bobina de extensão dos estabilizadores','Estende os quatro estabilizadores. Pino C4 do U42.'],['Y39',128,'Bobina de retração dos estabilizadores','Retrai os quatro estabilizadores. Pino C3 do U42.']]){
  const c=comp(id,'ele',x,54,-8,{cls:'o32',name:nm,code:id,pdy:6,desc:ds,specs:[['Válvula','BA, 3 posições, 4 vias'],['Resistência a 20 °C','19 Ω'],['Defeito',id==='Y40'?'Lâmpadas piscam em vermelho no sentido horário':'Lâmpadas piscam em vermelho no sentido anti-horário']]});box(c,9,14,9,'#2d2d2d');box(c,11,3,11,'#ffd43b',{at:[0,8,0]})}
n=comp('U42','ele',120,45,-66,{cls:'o32',name:'ECM dos estabilizadores (U42)',code:'U42',desc:'Módulo eletrônico dos estabilizadores. Desativa movimento e direção com os estabilizadores acionados, liga o alarme quando o sensor de nível indica que não estão apoiados ou que a máquina não está nivelada, e faz o nivelamento automático.',
  specs:[['A3 a A6','Transdutores de pressão (TD, DD, TE, DE)'],['A7 / A8','Sensor de inclinação S8 (passo e rolagem)'],['A9 / A10','Link de dados do estabilizador'],['A11 / A12','Alimentação e terra dos controles da plataforma'],['B6','Sinal de limite de altura'],['B7','Chave limitadora de descida LS66'],['B8','Chave de comando KS1'],['B10 / B11','Ré Y5 / Avanço Y6'],['C3','Bobina de retração Y39'],['C4','Bobina de extensão Y40'],['C5 / C6','Y35 dianteiro esq. / Y36 dianteiro dir.'],['C7 / C8','Y33 traseiro esq. / Y34 traseiro dir.'],['C9 / B5','Habilitação do controlador do motor'],['C10','Alimentação dos transdutores, S8 e LS5A'],['C11','Bobina de subida Y8'],['C12','Habilitação do movimento']],src:'Manual, legenda de pinagem do ECM dos estabilizadores (pág. 6-5)'});box(n,50,30,6,'#1f6a4f');
n=comp('U36','ele',-40,50,-80,{cls:'o32',name:'Teclado de controle dos estabilizadores',code:'U36',desc:'Placa U36 com botões de habilitação de função, extensão e retração, seis lâmpadas e o alarme H8. Dentro dela ficam a CPU U39, o chip de alimentação U40 e o chip de transmissão e recepção U41.',
  specs:[['BN105','Extensão do estabilizador'],['BN106','Habilitação de função'],['BN107','Retração do estabilizador'],['L51 a L54','Lâmpadas dos estabilizadores DE, DD, TE, TD'],['L69','Habilitação de elevação'],['L70','Erro de elevação'],['H8','Alarme multifunção do teclado'],['Cabo','QD20 ao ECM U42']]});box(n,64,44,6,'#2d3b45');
const KLAMP={};
for(const [k,x,y] of [['EN',-14,16],['ER',14,16],['LF',-22,2],['RF',22,2],['LR',-22,-12],['RR',22,-12]]){const ln=node(n,x,y,-4,null,'ele');box(ln,8,8,3,'#444');KLAMP[k]=ln}
const H8n=node(n,0,-10,-4,null,'ele');box(H8n,10,8,3,'#444');
for(const x of [-14,0,14]){const b=node(n,x,-18,-4,null,'ele');box(b,8,5,3,'#777')}
n=comp('S8','ele',0,29,-20,{cls:'o32',name:'Sensor de nível de 2 eixos',code:'S8',desc:'Mede inclinação nos dois eixos (passo e rolagem). Calibrado para 0° ± 0,5° com os estabilizadores acionados. Precisa de nova calibragem depois de ser trocado.',specs:[['Pinos do U42','A7 (passo) e A8 (rolagem)'],['Calibragem','Seção 1-4, nivelamento de 0° ± 0,5°'],['Defeito','Lâmpadas piscam alternando dianteiras/traseiras ou esquerda/direita']]});box(n,20,8,20,'#c24c2f');
n=comp('LS5A','ele',-140,73,45,{cls:'o32',name:'Chaves limitadoras de subida (LS5A, LS5B)',code:'LS5A',desc:'Informam ao ECM dos estabilizadores o limite de altura da tesoura. O U42 alimenta a LS5A pelo pino C10 e recebe o sinal de limite de altura no pino B6.',specs:[['Tipo','Normalmente fechada'],['Pino do U42','B6 (sinal), C10 (alimentação)']]});box(n,12,8,12,'#2f9e44');box(n,12,8,12,'#2f9e44',{at:[16,0,0]});
H('h_pA','p',[[34,51,42],[34,62,42],[60,62,10],[104,62,-8],[104,47,-8]],['PUMP','OUT_MAN'],'o32');
H('h_pB','p',[[138,36,-8],[145,36,30],[145,64,40],[80,64,42],[80,55,42]],['OUT_MAN','MANIFOLD'],'o32');
H('h_oLF','p',[[132,32,-8],[160,28,-30],[176,28,40],[176,40,56]],['OUT_MAN','OUT_LF'],'o32');
H('h_oRF','p',[[130,32,-14],[170,28,-30],[176,40,-56]],['OUT_MAN','OUT_RF'],'o32');
H('h_oLR','p',[[108,30,-10],[-100,24,-6],[-176,28,30],[-176,40,56]],['OUT_MAN','OUT_LR'],'o32');
H('h_oRR','p',[[106,30,-14],[-100,24,-16],[-176,28,-30],[-176,40,-56]],['OUT_MAN','OUT_RR'],'o32');
E('e_o_Y40','sig',[[122,52,-66],[122,60,-30],[112,60,-12],[112,56,-9]],['U42','Y40'],'o32');
E('e_o_Y39','sig',[[118,52,-66],[132,60,-30],[128,60,-12],[128,56,-9]],['U42','Y39'],'o32');
E('e_o_LF','sig',[[125,66,-64],[150,66,0],[170,66,62],[188,48,62]],['U42','Y35'],'o32');
E('e_o_RF','sig',[[130,48,-66],[160,50,-66],[188,48,-62]],['U42','Y36'],'o32');
E('e_o_LR','sig',[[105,66,-64],[-60,66,0],[-176,66,62],[-188,48,62]],['U42','Y33'],'o32');
E('e_o_RR','sig',[[108,50,-66],[-60,50,-68],[-188,48,-62]],['U42','Y34'],'o32');
E('e_o_PT1','sig',[[176,68,62],[160,70,20],[130,60,-40],[126,56,-62]],['U42','PT1'],'o32');
E('e_o_PT2','sig',[[176,68,-62],[150,60,-64],[128,52,-66]],['U42','PT2'],'o32');
E('e_o_PT4','sig',[[-176,68,62],[-60,70,10],[100,70,-40],[116,56,-62]],['U42','PT4'],'o32');
E('e_o_PT3','sig',[[-176,68,-62],[-60,60,-66],[110,50,-66]],['U42','PT3'],'o32');
E('e_o_S8','sig',[[0,31,-20],[40,40,-66],[104,48,-66]],['S8','U42'],'o32');
E('e_o_kp','dat',[[-40,46,-78],[0,42,-70],[96,44,-66]],['U36','U42'],'o32');
E('e_o_mc','dat',[[35,50,84],[35,62,70],[35,66,-60],[110,56,-62]],['U5','U42'],'o32');
E('e_o_LS5','sig',[[-140,73,45],[-100,66,0],[100,66,-50],[108,56,-62]],['LS5A','U42'],'o32');

/* ---------- geometria dinâmica ---------- */
function geom(){const th=(GEO.th0+S.u*(GEO.th1-GEO.th0))*D,c=Math.cos(th),s=Math.sin(th);return {th,c,s,cx:GEO.x0+GEO.Ln*c/2,Lc:GEO.Ln*c,Ls:GEO.Ln*s}}
function platTop(){const g=geom();return GEO.y0+GEO.n*g.Ls}
function pt_x(){return geom().cx}
function upAnchor(){const g=geom(),i=2,yb=GEO.y0+i*g.Ls,f=.3;return [g.cx-g.Lc/2+f*g.Lc, yb+f*g.Ls, 0]}
function upAnchor2(){const g=geom(),i=2,yb=GEO.y0+i*g.Ls,f=.3;return [g.cx+g.Lc/2-f*g.Lc, yb+f*g.Ls, 0]}
function scissor(){
  const g=geom();
  for(const a of arms){const yc=GEO.y0+(a.i+.5)*g.Ls,z=a.s*(a.k==='A'?60:74);a.nd.style.transform=`translate3d(${g.cx}px,${-yc}px,${z}px) rotateZ(${a.k==='A'?-g.th:g.th}rad)`}
  for(const p of pins){const yc=GEO.y0+(p.i+.5)*g.Ls;p.nd.style.transform=`translate3d(${g.cx}px,${-yc}px,${p.s*67}px)`}
  for(const t of xtubes){const yc=GEO.y0+(t.i+.5)*g.Ls;t.nd.style.transform=`translate3d(${g.cx}px,${-yc}px,0)`}
  {const yc=GEO.y0+.5*g.Ls;safeArm.style.transform=`translate3d(${g.cx+GEO.Ln*.15*g.c}px,${-(yc+GEO.Ln*.15*g.s*0)}px,${-45}px) rotateZ(${g.th}rad)`}
  plat.style.transform=`translate3d(${g.cx}px,${-(GEO.y0+GEO.n*g.Ls)}px,0)`;
  REG.PLATAFORMA.pos=[g.cx,GEO.y0+GEO.n*g.Ls+90,0];REG.TESOURA.pos=[g.cx,GEO.y0+g.Ls*2,0];
  /* cilindro principal */
  const f=.42,P=[GEO.x0+f*g.Lc,GEO.y0+f*g.Ls,0],B=LIFT.B,m=[lerp(B[0],P[0],.55),lerp(B[1],P[1],.55),0];
  barTf(lb,B,m);barTf(lr,m,P);liftTube.style.transform=`translate3d(${P[0]}px,${-P[1]}px,0)`;
  REG.LIFT_CYL.pos=[(B[0]+P[0])/2,(B[1]+P[1])/2,0];
  /* cilindro superior */
  const a=upAnchor(),b=upAnchor2(),m2=[lerp(a[0],b[0],.55),lerp(a[1],b[1],.55),0];
  barTf(ub,a,m2);barTf(ur,m2,b);upT1.style.transform=`translate3d(${a[0]}px,${-a[1]}px,0)`;upT2.style.transform=`translate3d(${b[0]}px,${-b[1]}px,0)`;
  Y9n.style.transform=`translate3d(${(a[0]+m2[0])/2}px,${-(a[1]+16)}px,0)`;REG.Y9.pos=[(a[0]+m2[0])/2,a[1]+16,0];REG.UP_CYL.pos=[(a[0]+b[0])/2,a[1],0];
  for(const id of ['h_upper','e_Y9','e_cab'])upd(LN[id]);
  /* patolas */
  guard.forEach(gd=>gd.arm.style.transform=`rotateZ(${gd.dir*S.u*38}deg)`);
}

/* ---------- modelos ---------- */
/* ===== 07 · MODELS · GS-3246, GS-2646, GS-3232 ===== */
const MODELS={
 '2046':{name:'GS-2046',n:3,tUp:32,tDown:26,load:'544 kg',climb:'25%',raise:'32 s (ficha técnica)',lower:'26 s (ficha técnica)',sys:'15 litros',sec:'Manual de peças 302.1 Conjunto da tesoura, GS-2046',ser:'46',hmax:'6,13 m'},
 '3246':{name:'GS-3246',n:5,hmax:'9,75 m',tUp:57,tDown:40,load:'317 kg',climb:'25%',raise:'55 a 59 s',lower:'38 a 42 s',sys:'19 litros',sec:'3-5 Conjunto da tesoura, GS-3232 e GS-3246',ser:'46'},
 '2646':{name:'GS-2646',n:4,hmax:'7,9 m',tUp:30,tDown:24,load:'454 kg',climb:'30%',raise:'28 a 32 s',lower:'22 a 26 s',sys:'18 litros',sec:'3-4 Conjunto da tesoura, GS-2632 e GS-2646',ser:'46'},
 '3232':{name:'GS-3232',n:5,hmax:'9,75 m',tUp:57,tDown:40,load:'227 kg',climb:'25%',raise:'55 a 59 s',lower:'38 a 42 s',sys:'19 litros',sec:'3-5 Conjunto da tesoura, GS-3232 e GS-3246',ser:'32',out:true}};
Object.values(REG).forEach(r=>{r.desc0=r.desc});
function inModel(r){const c=r.cls||'';if(c.includes('o32'))return S.model==='3232';if(c.includes('oup'))return S.model!=='2646'&&S.model!=='2046';return true}
function applySpecs(){const M=MODELS[S.model];
  REG.CHASSI.specs=[['Modelo',M.name],['Pneus','38,1 x 12,7 cm, borracha maciça'],['Área de contato do pneu','96,7 cm²'],['Torque da porca castelo, seca','406,7 Nm'],['Torque da porca castelo, lubrificada','305 Nm'],['Capacidade de subida',M.climb],['Ruído no ar','< 70 dB'],['Carga nominal na altura máxima',M.load]].concat(M.out?[['Nivelamento máx. dos estabilizadores','5° lateral, 3° dianteira-traseira']]:[]);
  REG.TANK.specs[1]=['Sistema completo',M.sys+' ('+M.name+')'];
  REG.TESOURA.specs=[['Procedimento no manual',M.sec],['Tempo para subir',M.raise],['Tempo para descer',M.lower],['Verificar coxins','Lista de verificação D-1']];
  REG.PLATAFORMA.specs=[['Carga nominal na altura máxima',M.load],['Altura máxima do piso',M.hmax],['Extensão do piso','0,91 m, sobre 4 rolos 47163GT'],['Portinhola','Conjunto 96760GT'],['Procedimentos no manual','2-1 Plataforma, 2-2 Extensão da plataforma'],['Sobrecarga (opcional)','3-7 Sistema de sobrecarga da plataforma']];
  REG.PUMP.desc=REG.PUMP.desc0+(M.out?' No GS-3232 o óleo passa primeiro pelo distribuidor dos estabilizadores (entrada IN) e segue pela saída OUT até a porta P do distribuidor de funções.':'');
  REG.LIFT_CYL.desc=REG.LIFT_CYL.desc0;
  $('#timeNote').textContent='No manual ('+M.name+'), subir leva '+M.raise+' e descer '+M.lower+' (×1).';$('#brandN').textContent='Genie '+M.name}
function setModel(k){
  S.model=k;$('#app').dataset.model=k;GEO.n=MODELS[k].n;
  if(S.sel&&REG[S.sel]&&!inModel(REG[S.sel])){REG[S.sel].node.classList.remove('sel');S.sel=null}
  if(S.fault&&FB[S.fault]&&REG[FB[S.fault][4]])REG[FB[S.fault][4]].node.classList.remove('flt');
  S.fault=null;S.tilt=false;S.u=0;S._u=-1;S.oext=0;S.lev=0;S.eos=false;S.roll=0;S.pitch=0;
  $('#roll').value=0;$('#pitch').value=0;$('#rollV').textContent='0°';$('#pitchV').textContent='0°';
  arms.forEach(a=>a.nd.style.display=a.i>=GEO.n?'none':'');pins.forEach(p=>p.nd.style.display=p.i>=GEO.n?'none':'');xtubes.forEach(p=>p.nd.style.display=p.i>=GEO.n?'none':'');
  $$('.chip[data-model]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.model===k));
  applySpecs();buildFaults();buildList($('#srch').value);buildSchem();renderInfo();view('iso');scissor();Store.save();if(booted)A11y.say('Modelo '+MODELS[k].name)}
$$('.chip[data-model]').forEach(b=>b.onclick=()=>setModel(b.dataset.model));

/* ===== 08 · FAULTS · tabela de falhas do manual e lista acessível ===== */
const FAULTS=[
 ['01','Erro interno do ECM.','EPROM não programada.','Substitua o ECM.','U5',null],
 ['02','Erro de comunicação no ECM/plataforma.','Cabo de controle OU controles da plataforma com defeito.','Realize um diagnóstico de falha no cabo de controle OU nos controles da plataforma.','U3',null],
 ['03','Configuração indefinida da chave DIP da plataforma.','Configuração incorreta da chave DIP.','Corrija a configuração da chave DIP.','U3',null],
 ['12','Chave seletora de subida/descida do chassi fechada na partida.','Chave de subida/descida com defeito.','Realize um diagnóstico de falha na chave de subida/descida.','TS66',null],
 ['18','Falha na patola de proteção.','Defeito na chave da patola de proteção OU obstrução na articulação da patola.','Realize um diagnóstico de falha na patola de proteção OU remova a obstrução.','LS7',null],
 ['19','Falha na chave limitadora.','Chave limitadora com defeito OU fio desconectado da chave limitadora.','Realize um diagnóstico de falha na chave limitadora OU inspecione a conexão do fio.','LS6',null],
 ['42','Falha na chave de giro à esquerda da plataforma.','Defeito na microchave de giro à esquerda.','Realize um diagnóstico de falha na microchave de giro à esquerda.','U3','left'],
 ['43','Falha na chave de giro à direita da plataforma.','Defeito na microchave de giro à direita.','Realize um diagnóstico de falha na microchave de giro à direita.','U3','right'],
 ['46','Falha na chave de habilitação de movimento da plataforma.','Defeito na chave de habilitação de movimento.','Realize um diagnóstico de falha na chave de habilitação de movimento.','U3',null],
 ['47','Falha no joystick da plataforma.','Potenciômetro do joystick não está centrado.','Verifique o ajuste do potenciômetro.','JC1',null],
 ['52','Falha na bobina de avanço.','Defeito na bobina OU fio desconectado da bobina.','Realize um diagnóstico de falha na bobina OU inspecione a conexão do fio.','Y6','fwd'],
 ['53','Falha na bobina de marcha a ré.','Defeito na bobina OU fio desconectado da bobina.','Realize um diagnóstico de falha na bobina OU inspecione a conexão do fio.','Y5','rev'],
 ['54','Falha na bobina de subida.','Defeito na bobina OU fio desconectado da bobina.','Realize um diagnóstico de falha na bobina OU inspecione a conexão do fio.','Y8','up'],
 ['55','Falha na bobina de descida.','Defeito na bobina OU fio desconectado da bobina.','Realize um diagnóstico de falha na bobina OU inspecione a conexão do fio.','Y7','down'],
 ['56','Falha na bobina de giro à direita.','Defeito na bobina OU fio desconectado da bobina.','Realize um diagnóstico de falha na bobina OU inspecione a conexão do fio.','Y3','right'],
 ['57','Falha na bobina de giro à esquerda.','Defeito na bobina OU fio desconectado da bobina.','Realize um diagnóstico de falha na bobina OU inspecione a conexão do fio.','Y4','left'],
 ['58','Falha na bobina do freio.','Defeito na bobina OU fio desconectado da bobina.','Realize um diagnóstico de falha na bobina OU inspecione a conexão do fio.','BRK_MAN',null],
 ['59','Falha na bobina em série/paralelo.','Configuração incorreta da chave DIP.','Realize um diagnóstico de falha e corrija as configurações da chave DIP.','Y1',null],
 ['68','Baixa tensão na bateria.','Baterias descarregadas.','Recarregue as baterias.','B5',null],
 ['LL','Falha - Desnivelado.','Inclinação do chassi excede o ajuste do sensor de nível.','Reduza o ângulo do chassi.','S7','tilt'],
 ['OL','Falha de corte por sobrecarga.','Excesso de peso na plataforma.','Remova peso.','CR_BLOCK',null]];
const FB={};FAULTS.forEach(f=>FB[f[0]]=f);
const FOUT=[
 ['ER2','Lâmpada de erro de elevação pisca 2 vezes em vermelho.','Defeito na bobina OU fio desconectado da bobina (falha na bobina de subida).','Realize um diagnóstico de falha na bobina OU inspecione a conexão do fio.','Y8',null,{lamp:'ER',n:2}],
 ['LF2','Lâmpada do estabilizador dianteiro esquerdo pisca 2 vezes em vermelho.','Defeito na bobina OU fio desconectado da bobina.','Realize um diagnóstico de falha na bobina OU inspecione a conexão do fio.','Y35',null,{lamp:'LF',n:2}],
 ['RF2','Lâmpada do estabilizador dianteiro direito pisca 2 vezes em vermelho.','Defeito na bobina OU fio desconectado da bobina.','Realize um diagnóstico de falha na bobina OU inspecione a conexão do fio.','Y36',null,{lamp:'RF',n:2}],
 ['RR2','Lâmpada do estabilizador traseiro direito pisca 2 vezes em vermelho.','Defeito na bobina OU fio desconectado da bobina.','Realize um diagnóstico de falha na bobina OU inspecione a conexão do fio.','Y34',null,{lamp:'RR',n:2}],
 ['LR2','Lâmpada do estabilizador traseiro esquerdo pisca 2 vezes em vermelho.','Defeito na bobina OU fio desconectado da bobina.','Realize um diagnóstico de falha na bobina OU inspecione a conexão do fio.','Y33',null,{lamp:'LR',n:2}],
 ['LF3','Lâmpada do estabilizador dianteiro esquerdo pisca 3 vezes em vermelho (falha no transdutor de pressão).','Curto com o terra OU fio desconectado do transdutor de pressão.','Inspecione a conexão da fiação.','PT1',null,{lamp:'LF',n:3}],
 ['RF3','Lâmpada do estabilizador dianteiro direito pisca 3 vezes em vermelho (falha no transdutor de pressão).','Curto com o terra OU fio desconectado do transdutor de pressão.','Inspecione a conexão da fiação.','PT2',null,{lamp:'RF',n:3}],
 ['RR3','Lâmpada do estabilizador traseiro direito pisca 3 vezes em vermelho (falha no transdutor de pressão).','Curto com o terra OU fio desconectado do transdutor de pressão.','Inspecione a conexão da fiação.','PT3',null,{lamp:'RR',n:3}],
 ['LR3','Lâmpada do estabilizador traseiro esquerdo pisca 3 vezes em vermelho (falha no transdutor de pressão).','Curto com o terra OU fio desconectado do transdutor de pressão.','Inspecione a conexão da fiação.','PT4',null,{lamp:'LR',n:3}],
 ['LF4','Lâmpada do estabilizador dianteiro esquerdo pisca 4 vezes em vermelho (falha no transdutor de pressão).','Curto com a alimentação.','Realize o diagnóstico do chicote do transdutor de pressão OU substitua o chicote.','PT1',null,{lamp:'LF',n:4}],
 ['AFB','Lâmpadas dos estabilizadores piscam em vermelho, alternando dianteiros e traseiros (falha no sensor de nível).','Curto com o terra OU fio desconectado do sensor de nível.','Inspecione a conexão da fiação.','S8',null,{alt:'fb'}],
 ['ALR','Lâmpadas dos estabilizadores piscam em vermelho, alternando da esquerda para a direita (falha no sensor de nível).','Curto com a alimentação.','Realize o diagnóstico do chicote do sensor dos estabilizadores OU substitua o chicote.','S8',null,{alt:'lr'}],
 ['CW','Lâmpadas piscam em vermelho no sentido horário (falha na bobina de extensão).','Defeito na bobina OU fio desconectado da bobina.','Realize um diagnóstico de falha na bobina OU inspecione a conexão da fiação.','Y40',null,{cw:1}],
 ['CCW','Lâmpadas piscam em vermelho no sentido anti-horário (falha na bobina de retração).','Defeito na bobina OU fio desconectado da bobina.','Realize um diagnóstico de falha na bobina OU inspecione a conexão da fiação.','Y39',null,{cw:-1}],
 ['CAL','Todas as lâmpadas ficam vermelhas na partida inicial e o alarme soa (sem dados de calibragem).','Sensor de nível e transdutores de pressão dos estabilizadores não estão calibrados.','Calibre o sensor de nível dos estabilizadores e os transdutores de pressão dos estabilizadores.','S8',null,{allred:1}],
 ['NL','Após o nivelamento automático, todas as lâmpadas ficam vermelhas e o alarme soa (falha de estabilizador desnivelado).','A máquina está desnivelada OU nenhum estabilizador está em contato com o solo.','Reposicione a máquina OU acione novamente os estabilizadores.','S8',null,{allred:1}]];
FOUT.forEach(f=>FB[f[0]]=f);
function buildFaults(){
  const base=FAULTS.filter(f=>!(S.model==='3232'&&f[0]==='54'));
  const item=f=>`<div class="fl-item" role="listitem" data-c="${f[0]}"><button class="fl-h" aria-pressed="false" aria-expanded="false" aria-controls="fd-${f[0]}"><span class="cd">${f[0]}</span><span>${f[1]}</span></button><div class="dt" id="fd-${f[0]}" role="region" aria-label="Detalhes do código ${f[0]}"><b>Causa provável:</b> ${f[2]}<br><b>Solução:</b> ${f[3]}<br><button class="chip" data-go="${f[4]}" style="margin-top:8px">Ver peça: ${REG[f[4]].code}</button></div></div>`;
  $('#faults').innerHTML=base.map(item).join('')+(S.model==='3232'?`<h4>Estabilizadores: padrões do teclado</h4><p class="note">Nestes casos o código aparece como lâmpadas piscando no teclado (U36). Ligue a chave em Plataforma para ver.</p>`+FOUT.map(item).join(''):'');
  $$('.fl-item > .fl-h').forEach(b=>b.onclick=()=>setFault(b.parentNode.dataset.c));
  $$('.fl-item [data-go]').forEach(b=>b.onclick=()=>select(b.dataset.go,true))}


/* ===== 09 · INFO · seleção, painel da peça, lista e falhas ===== */
function select(id,focus){
  if(!REG[id])return;
  if(S.sel&&REG[S.sel]){REG[S.sel].node.classList.remove('sel');(REG[S.sel].lines||[]).forEach(l=>LN[l]&&LN[l].g.classList.remove('hl'))}
  S.sel=id;const r=REG[id];r.node.classList.add('sel');r.lines.forEach(l=>LN[l]&&LN[l].g.classList.add('hl'));
  if(focus)focusOn(r.pos,Math.max(tgt.zoom,2.2*bz()));
  if(typeof Panels!=='undefined'&&!Panels.is('side'))Panels.set('side',true,true);
  tab('info');renderInfo();A11y.say(r.code+', '+r.name);
  $$('#plist button').forEach(b=>b.classList.toggle('cur',b.dataset.id===id))}
function renderInfo(){
  const id=S.sel,p=$('#p-info');
  if(!id){p.innerHTML=`<h2>Toque numa peça</h2><p>Clique em qualquer componente do modelo 3D, num rótulo ou na aba Lista para ver função, especificações e ligações.</p><p>Arraste para girar, Shift + arraste (ou botão direito) para mover, roda do mouse ou pinça para aproximar.</p><h4>Dicas</h4><p>Ligue a chave em Plataforma, escolha Elevação e segure ▲. O óleo laranja sai da bomba, passa pela válvula Y8 do distribuidor e chega ao cilindro. Use Camada: Hidráulico ou Elétrico para isolar cada sistema.</p>`;return}
  const r=REG[id],tl={hyd:'Hidráulica',ele:'Elétrica',mec:'Estrutura'}[r.layer];
  const rel=[...new Set(r.lines.flatMap(l=>LN[l]?LN[l].comps:[]).filter(c=>c!==id&&REG[c]))];
  p.innerHTML=`<span class="tag ${r.layer}">${tl}</span><span class="tag">${r.code}</span><h2>${r.name}</h2><p>${r.desc}</p>
   <div class="live" id="liveBox"></div>
   ${r.specs&&r.specs.length?`<h4>Especificações do manual</h4><table class="sp">${r.specs.map(s=>`<tr><td>${s[0]}</td><td>${s[1]}</td></tr>`).join('')}</table>`:''}
   ${rel.length?`<h4>Ligada a</h4><div class="links">${rel.map(c=>`<button data-go="${c}">${REG[c].code} · ${REG[c].name.split(' (')[0]}</button>`).join('')}</div>`:''}
   ${Schem.infoSection(id)}
   ${r.src?`<p class="src">${r.src}</p>`:''}`;
  $$('#p-info [data-go]').forEach(b=>b.onclick=()=>select(b.dataset.go,true));Schem.hydrate(id);liveInfo()}
const OUTMAP={Y8:'Y8',Y7:'Y7',Y9:'Y9',Y6:'Y6',Y5:'Y5',Y3:'Y3',Y4:'Y4',Y1:'Y1'};
function liveInfo(){const b=$('#liveBox');if(!b||!S.sel)return;const id=S.sel;let t='';
  if(OUTMAP[id])t=S.out[id]?'<b style="color:var(--pos)">ENERGIZADA</b> agora':'Desenergizada';
  else if(id==='M5'||id==='PUMP')t=S.pump?'<b style="color:var(--hyd)">EM FUNCIONAMENTO</b> agora':'Parado';
  else if(id==='MANIFOLD')t=S.pump?`Recebendo óleo da bomba, pressão ilustrativa <b>${S.P.toFixed(0)} bar</b>`:'Sem fluxo de pressão';
  else if(id==='B5')t=`Tensão <b>${S.V.toFixed(1)} V</b>`+(S.fault==='68'?' (baixa)':'');
  else if(id==='H5')t=S.out.H5?'<b style="color:var(--pos)">SOANDO</b>':'Silencioso';
  else if(id==='P1')t=S.estop?'<b style="color:var(--bad)">PRESSIONADO</b>, comando cortado':'Liberado';
  else if(id==='KS1')t={off:'Desligada',ground:'Controles de solo',platform:'Controles da plataforma'}[S.key];
  else if(id==='BRK_L'||id==='BRK_R')t=S.out.Y6||S.out.Y5?'<b style="color:var(--hyd)">LIBERADO</b> pela pressão':'Aplicado (mola)';
  else if(id==='LIFT_CYL'||id==='UP_CYL')t=`Elevação <b>${(S.u*100).toFixed(0)}%</b>`;
  else if(id==='S7')t=S.tilt?'<b style="color:var(--bad)">Chassi desnivelado</b>, código LL':'Nivelado';
  else if(id==='STEER_CYL')t=`Ângulo das rodas <b>${(S.steer).toFixed(0)}°</b>`;
  else if(id==='U5')t=powered()?'Energizado, em funcionamento':'Sem alimentação';
  else t=powered()?'Circuito de comando energizado':'Circuito de comando desligado';
  if(S.fault&&FB[S.fault][4]===id)t+=` · <b style="color:var(--bad)">Falha ${S.fault} simulada</b>`;
  if(b._h!==t){b._h=t;b.innerHTML=t}}
/* lista de peças */
function buildList(q=''){
  q=q.toLowerCase();const G={hyd:[],ele:[],mec:[]};
  Object.values(REG).forEach(r=>{if(!inModel(r))return;if(q&&!(r.name+' '+r.code+' '+r.desc).toLowerCase().includes(q))return;(G[r.layer]||G.mec).push(r)});
  $('#plist').innerHTML=[['hyd','Hidráulica'],['ele','Elétrica'],['mec','Estrutura']].map(([k,t])=>G[k].length?`<h4>${t}</h4>`+G[k].map(r=>`<button data-id="${r.id}"><span class="cd">${r.code}</span><span>${r.name}</span></button>`).join(''):'').join('')||'<p class="note">Nada encontrado.</p>';
  $$('#plist button').forEach(b=>b.onclick=()=>select(b.dataset.id,true))}
$('#srch').oninput=e=>buildList(e.target.value);
/* falhas */
$('#clrFault').onclick=()=>setFault(null);
function setFault(c){
  if(S.fault&&REG[FB[S.fault][4]])REG[FB[S.fault][4]].node.classList.remove('flt');
  S.fault=(c===S.fault)?null:c;S.tilt=S.fault==='LL';
  if(S.fault)REG[FB[S.fault][4]].node.classList.add('flt');
  $$('.fl-item').forEach(i=>{const on=i.dataset.c===S.fault;i.dataset.on=on;const h=i.firstElementChild;h.setAttribute('aria-pressed',on);h.setAttribute('aria-expanded',on)});
  A11y.say(S.fault?'Falha '+S.fault+' simulada: '+FB[S.fault][1]:'Falha limpa');
  if(S.fault)focusOn(REG[FB[S.fault][4]].pos,2.2*bz());
  liveInfo()}
/* ===== MÓDULO · Schem: esquemas do manual (por faixa de série), pontos clicáveis e miniaturas com destaque ===== */
const Schem=(()=>{
  const PGN=k=>'6-'+k.slice(1);
  const SCHEMS=[
   {kd:'Hidráulico',t:'Esquema hidráulico',pg:{46:['h90'],32:['h90']},lbl:{46:'GS4605-75438 a GS4606-79027'},rng:{46:[[5,75438],[6,79027]]}},
   {kd:'Hidráulico',t:'Esquema hidráulico',pg:{46:['h91']},lbl:{46:'GS4606-79028 a GS4607-84839'},rng:{46:[[6,79028],[7,84839]]}},
   {kd:'Hidráulico',t:'Esquema hidráulico',pg:{46:['h92'],32:['h92']},lbl:{46:'após GS4607-84839 e a partir de GS4609C-101',32:'após GS3207-84866 e a partir de GS3208C-101'},rng:{46:[[7,84840],null],32:[[7,84867],null]}},
   {kd:'Hidráulico',t:'Hidráulico dos estabilizadores',pg:{32:['h93']},lbl:{32:'a partir de GS3207-84867 e de GS3208C-101'},rng:{32:[[7,84867],null]}},
   {kd:'Elétrico ANSI, CSA e Austrália',t:'Esquema elétrico ANSI',pg:{46:['a26','a27','a28']},lbl:{46:'GS4605-75438 a GS4606-78915'},rng:{46:[[5,75438],[6,78915]]}},
   {kd:'Elétrico ANSI, CSA e Austrália',t:'Esquema elétrico ANSI',pg:{46:['a30','a31','a32']},lbl:{46:'GS4606-78916 a GS4607-82535'},rng:{46:[[6,78916],[7,82535]]}},
   {kd:'Elétrico ANSI, CSA e Austrália',t:'Esquema elétrico ANSI',pg:{46:['a34','a35','a36']},lbl:{46:'GS4607-82536 a GS4607-84839'},rng:{46:[[7,82536],[7,84839]]}},
   {kd:'Elétrico ANSI, CSA e Austrália',t:'Esquema elétrico ANSI',pg:{46:['a38','a39','a41'],32:['a38','a39','a40','a41']},lbl:{46:'após GS4607-84839 e a partir de GS4609C-101',32:'após GS3207-84866 e a partir de GS3208C-101'},rng:{46:[[7,84840],null],32:[[7,84867],null]}},
   {kd:'Elétrico CE',t:'Esquema elétrico CE',pg:{46:['c66','c67','c68']},lbl:{46:'GS4605-75438 a GS4605-76734'},rng:{46:[[5,75438],[5,76734]]}},
   {kd:'Elétrico CE',t:'Esquema elétrico CE',pg:{46:['c70','c71','c72']},lbl:{46:'GS4605-76735 a GS4606-78915'},rng:{46:[[5,76735],[6,78915]]}},
   {kd:'Elétrico CE',t:'Esquema elétrico CE',pg:{46:['c74','c75','c76']},lbl:{46:'GS4606-78916 a GS4607-82535'},rng:{46:[[6,78916],[7,82535]]}},
   {kd:'Elétrico CE',t:'Esquema elétrico CE',pg:{46:['c78','c79','c80']},lbl:{46:'GS4607-82536 a GS4607-84839'},rng:{46:[[7,82536],[7,84839]]}},
   {kd:'Elétrico CE',t:'Esquema elétrico CE',pg:{46:['c82','c83','c85'],32:['c82','c83','c84','c85']},lbl:{46:'após GS4607-84839 e a partir de GS4609C-101',32:'após GS3207-84866 e a partir de GS3208C-101'},rng:{46:[[7,84840],null],32:[[7,84867],null]}},
   {kd:'Chicotes',t:'Chicote dos controles de solo e sensores de nível',pg:{46:['w6'],32:['w6']},lbl:{46:'todas as séries',32:'todas as séries'},rng:{46:[[0,0],null],32:[[0,0],null]}},
   {kd:'Chicotes',t:'Caixa de controle da plataforma e teclado dos estabilizadores',pg:{46:['w7'],32:['w7']},lbl:{46:'todas as séries',32:'todas as séries'},rng:{46:[[0,0],null],32:[[0,0],null]}}];
  SCHEMS[0].rng[32]=null;delete SCHEMS[0].rng[32];SCHEMS[0].pg={46:['h90']};
  /* posições (fração da página) de cada símbolo, extraídas da camada de texto do PDF do manual */
  const HOT={"a26":{"P1":[[0.3565,0.2237,0.3826,0.2393]],"KS1":[[0.4489,0.271,0.4848,0.2866]],"H5":[[0.8205,0.3041,0.8474,0.3198]],"LS7":[[0.8246,0.3595,0.8589,0.3752]],"TS66":[[0.7033,0.3722,0.7467,0.3879]],"CB2":[[0.332,0.4041,0.3688,0.4197]],"LS8":[[0.8246,0.4231,0.8589,0.4387]],"G6":[[0.4528,0.7686,0.4805,0.7842]],"QD1":[[0.3184,0.7919,0.3568,0.8076],[0.3119,0.5335,0.3503,0.5492]],"U5":[[0.7699,0.6159,0.7968,0.6315]],"U6":[[0.3418,0.6715,0.3687,0.6872]],"M5":[[0.4086,0.5997,0.4379,0.6153],[0.39,0.5766,0.4185,0.5923]],"U9":[[0.2654,0.6029,0.2923,0.6185]],"F6":[[0.2438,0.5611,0.2691,0.5768]],"B5":[[0.1379,0.6585,0.164,0.6742]]},"a27":{"U5":[[0.445,0.262,0.4635,0.2734],[0.3395,0.6159,0.3664,0.6315]],"LS6":[[0.2515,0.3429,0.2856,0.3585]],"S7":[[0.7902,0.46,0.8162,0.4757]],"Y1":[[0.165,0.7317,0.1911,0.7473]],"Y3":[[0.2484,0.7317,0.2745,0.7473]],"Y4":[[0.3303,0.7317,0.3563,0.7473]],"Y5":[[0.4128,0.7317,0.4389,0.7473]],"Y6":[[0.4964,0.7317,0.5225,0.7473]],"Y9":[[0.5802,0.7317,0.6062,0.7473]],"Y7":[[0.6615,0.7317,0.6876,0.7473]],"Y8":[[0.744,0.7317,0.7701,0.7473]]},"a28":{"U3":[[0.273,0.3033,0.2998,0.3189]],"JC1":[[0.4341,0.3502,0.4683,0.3658]]},"a30":{"P1":[[0.3565,0.2237,0.3826,0.2393]],"KS1":[[0.4489,0.271,0.4848,0.2866]],"H5":[[0.8205,0.3041,0.8474,0.3198]],"LS7":[[0.8246,0.3595,0.8589,0.3752]],"TS66":[[0.7033,0.3722,0.7467,0.3879]],"CB2":[[0.332,0.4041,0.3688,0.4197]],"LS8":[[0.8246,0.4231,0.8589,0.4387]],"G6":[[0.4528,0.7686,0.4805,0.7842]],"QD1":[[0.3184,0.7919,0.3568,0.8076],[0.3119,0.5335,0.3503,0.5492]],"U5":[[0.7699,0.6159,0.7968,0.6315]],"U6":[[0.3418,0.6715,0.3687,0.6872]],"M5":[[0.4086,0.5997,0.4379,0.6153],[0.39,0.5766,0.4185,0.5923]],"U9":[[0.2654,0.6029,0.2923,0.6185]],"F6":[[0.2438,0.5611,0.2691,0.5768]],"B5":[[0.1379,0.6585,0.164,0.6742]]},"a31":{"U5":[[0.445,0.262,0.4635,0.2734],[0.3395,0.6159,0.3664,0.6315]],"LS6":[[0.2515,0.3429,0.2856,0.3585]],"S7":[[0.7902,0.46,0.8162,0.4757]],"Y1":[[0.165,0.7317,0.1911,0.7473]],"Y3":[[0.2484,0.7317,0.2745,0.7473]],"Y4":[[0.3303,0.7317,0.3563,0.7473]],"Y5":[[0.4128,0.7317,0.4389,0.7473]],"Y6":[[0.4964,0.7317,0.5225,0.7473]],"Y9":[[0.5802,0.7317,0.6062,0.7473]],"Y7":[[0.6615,0.7317,0.6876,0.7473]],"Y8":[[0.744,0.7317,0.7701,0.7473]]},"a32":{"U3":[[0.273,0.3033,0.2998,0.3189]],"JC1":[[0.4341,0.3502,0.4683,0.3658]]},"a34":{"P1":[[0.3561,0.224,0.3821,0.2396]],"KS1":[[0.4485,0.2713,0.4843,0.2869]],"H5":[[0.82,0.3044,0.8469,0.3201]],"LS7":[[0.8242,0.3598,0.8585,0.3755]],"TS66":[[0.7029,0.3725,0.7463,0.3882]],"CB2":[[0.3316,0.4044,0.3684,0.42]],"LS8":[[0.8242,0.4233,0.8585,0.439]],"G6":[[0.4524,0.7689,0.4801,0.7845]],"QD1":[[0.3179,0.7922,0.3563,0.8079],[0.3114,0.5338,0.3499,0.5495]],"U5":[[0.7695,0.6162,0.7964,0.6318]],"U6":[[0.3414,0.6718,0.3683,0.6875]],"M5":[[0.4082,0.6,0.4375,0.6156],[0.3896,0.5769,0.4181,0.5926]],"U9":[[0.265,0.6032,0.2919,0.6188]],"F6":[[0.2434,0.5614,0.2687,0.5771]],"B5":[[0.1375,0.6588,0.1636,0.6745]]},"a35":{"U5":[[0.4446,0.2624,0.4631,0.2737],[0.3391,0.6162,0.366,0.6319]],"LS6":[[0.2511,0.3432,0.2852,0.3589]],"S7":[[0.7897,0.4603,0.8158,0.476]],"Y1":[[0.1646,0.732,0.1906,0.7476]],"Y3":[[0.248,0.732,0.274,0.7476]],"Y4":[[0.3298,0.732,0.3559,0.7476]],"Y5":[[0.4124,0.732,0.4384,0.7476]],"Y6":[[0.496,0.732,0.5221,0.7476]],"Y9":[[0.5798,0.732,0.6058,0.7476]],"Y7":[[0.6611,0.732,0.6871,0.7476]],"Y8":[[0.7436,0.732,0.7697,0.7476]]},"a36":{"U3":[[0.2725,0.3036,0.2993,0.3192]],"JC1":[[0.4337,0.3505,0.4678,0.3661]]},"a38":{"P1":[[0.357,0.2278,0.3831,0.2435]],"KS1":[[0.4494,0.2752,0.4852,0.2908]],"H5":[[0.821,0.3083,0.8479,0.3239]],"LS7":[[0.8251,0.3637,0.8594,0.3793]],"TS66":[[0.7038,0.3764,0.7472,0.3921]],"CB2":[[0.3956,0.4067,0.4323,0.4224]],"QD1":[[0.3124,0.5377,0.3508,0.5534],[0.3189,0.7961,0.3573,0.8117]],"F6":[[0.2443,0.5653,0.2696,0.581]],"M5":[[0.3905,0.5808,0.419,0.5964],[0.4091,0.6038,0.4384,0.6195]],"U9":[[0.2659,0.607,0.2928,0.6227]],"U5":[[0.7704,0.62,0.7973,0.6357]],"LS8":[[0.8251,0.4272,0.8594,0.4429]],"B5":[[0.1384,0.6627,0.1645,0.6783]],"G6":[[0.4535,0.7771,0.4813,0.7927]],"U6":[[0.3423,0.6757,0.3692,0.6913]]},"a39":{},"a40":{},"a41":{},"c66":{"P1":[[0.3544,0.2237,0.3805,0.2393]],"KS1":[[0.4466,0.271,0.4824,0.2866]],"H5":[[0.8174,0.3041,0.8443,0.3198]],"LS7":[[0.8216,0.3595,0.8558,0.3752]],"TS66":[[0.7006,0.3722,0.7438,0.3879]],"CB2":[[0.33,0.4041,0.3667,0.4197]],"LS8":[[0.8216,0.4231,0.8558,0.4387]],"G6":[[0.4508,0.7746,0.4785,0.7902]],"QD1":[[0.3164,0.7919,0.3547,0.8076],[0.3099,0.5335,0.3482,0.5492]],"U5":[[0.767,0.6159,0.7939,0.6315]],"U6":[[0.3398,0.6715,0.3667,0.6872]],"M5":[[0.4064,0.5997,0.4357,0.6153],[0.3879,0.5766,0.4164,0.5923]],"U9":[[0.2636,0.6029,0.2904,0.6185]],"F6":[[0.242,0.5611,0.2672,0.5768]],"B5":[[0.1363,0.6585,0.1624,0.6742]]},"c67":{"U5":[[0.445,0.262,0.4635,0.2734],[0.3395,0.6159,0.3664,0.6315]],"LS6":[[0.5614,0.3188,0.5957,0.3344]],"S7":[[0.7902,0.46,0.8162,0.4757]],"Y1":[[0.165,0.7317,0.1911,0.7473]],"Y3":[[0.2484,0.7317,0.2745,0.7473]],"Y4":[[0.3303,0.7317,0.3563,0.7473]],"Y5":[[0.4128,0.7317,0.4389,0.7473]],"Y6":[[0.4964,0.7317,0.5225,0.7473]],"Y9":[[0.5781,0.7317,0.6041,0.7473]],"Y7":[[0.6615,0.7317,0.6876,0.7473]],"Y8":[[0.744,0.7317,0.7701,0.7473]]},"c68":{"U3":[[0.2779,0.3033,0.3047,0.3189]],"JC1":[[0.439,0.3502,0.4732,0.3658]]},"c70":{"P1":[[0.356,0.2237,0.382,0.2393]],"KS1":[[0.4482,0.271,0.484,0.2866]],"H5":[[0.819,0.3041,0.8459,0.3198]],"LS7":[[0.8231,0.3595,0.8574,0.3752]],"TS66":[[0.7021,0.3722,0.7454,0.3879]],"CB2":[[0.3316,0.4041,0.3683,0.4197]],"LS8":[[0.8232,0.4231,0.8574,0.4387]],"G6":[[0.4523,0.7746,0.48,0.7902]],"QD1":[[0.3179,0.7919,0.3563,0.8076],[0.3115,0.5335,0.3498,0.5492]],"U5":[[0.7686,0.6159,0.7954,0.6315]],"U6":[[0.3414,0.6715,0.3682,0.6872]],"M5":[[0.408,0.5997,0.4373,0.6153],[0.3894,0.5766,0.4179,0.5923]],"U9":[[0.2651,0.6029,0.292,0.6185]],"F6":[[0.2436,0.5611,0.2688,0.5768]],"B5":[[0.1379,0.6585,0.1639,0.6742]]},"c71":{"U5":[[0.445,0.262,0.4635,0.2734],[0.3395,0.6159,0.3664,0.6315]],"LS6":[[0.5614,0.3188,0.5957,0.3344]],"S7":[[0.7902,0.46,0.8162,0.4757]],"Y1":[[0.165,0.7317,0.1911,0.7473]],"Y3":[[0.2484,0.7317,0.2745,0.7473]],"Y4":[[0.3303,0.7317,0.3563,0.7473]],"Y5":[[0.4128,0.7317,0.4389,0.7473]],"Y6":[[0.4964,0.7317,0.5225,0.7473]],"Y9":[[0.5781,0.7317,0.6041,0.7473]],"Y7":[[0.6615,0.7317,0.6876,0.7473]],"Y8":[[0.744,0.7317,0.7701,0.7473]]},"c72":{"U3":[[0.273,0.3033,0.2998,0.3189]],"JC1":[[0.4341,0.3502,0.4683,0.3658]]},"c74":{"P1":[[0.356,0.2237,0.382,0.2393]],"KS1":[[0.4482,0.271,0.484,0.2866]],"H5":[[0.819,0.3041,0.8459,0.3198]],"LS7":[[0.8231,0.3595,0.8574,0.3752]],"TS66":[[0.7021,0.3722,0.7454,0.3879]],"CB2":[[0.3316,0.4041,0.3683,0.4197]],"LS8":[[0.8232,0.4231,0.8574,0.4387]],"G6":[[0.4523,0.7746,0.48,0.7902]],"QD1":[[0.3179,0.7919,0.3563,0.8076],[0.3115,0.5335,0.3498,0.5492]],"U5":[[0.7686,0.6159,0.7954,0.6315]],"U6":[[0.3414,0.6715,0.3682,0.6872]],"M5":[[0.408,0.5997,0.4373,0.6153],[0.3894,0.5766,0.4179,0.5923]],"U9":[[0.2651,0.6029,0.292,0.6185]],"F6":[[0.2436,0.5611,0.2688,0.5768]],"B5":[[0.1379,0.6585,0.1639,0.6742]]},"c75":{"U5":[[0.445,0.262,0.4635,0.2734],[0.3395,0.6159,0.3664,0.6315]],"LS6":[[0.5614,0.3188,0.5957,0.3344]],"S7":[[0.7902,0.46,0.8162,0.4757]],"Y1":[[0.165,0.7317,0.1911,0.7473]],"Y3":[[0.2484,0.7317,0.2745,0.7473]],"Y4":[[0.3303,0.7317,0.3563,0.7473]],"Y5":[[0.4128,0.7317,0.4389,0.7473]],"Y6":[[0.4964,0.7317,0.5225,0.7473]],"Y9":[[0.5781,0.7317,0.6041,0.7473]],"Y7":[[0.6615,0.7317,0.6876,0.7473]],"Y8":[[0.744,0.7317,0.7701,0.7473]]},"c76":{"U3":[[0.273,0.3033,0.2998,0.3189]],"JC1":[[0.4341,0.3502,0.4683,0.3658]]},"c78":{"P1":[[0.356,0.2236,0.382,0.2393]],"KS1":[[0.4482,0.271,0.484,0.2866]],"H5":[[0.819,0.3041,0.8459,0.3197]],"LS7":[[0.8231,0.3595,0.8574,0.3751]],"TS66":[[0.7021,0.3722,0.7454,0.3879]],"CB2":[[0.3316,0.4041,0.3683,0.4197]],"LS8":[[0.8232,0.423,0.8574,0.4387]],"G6":[[0.4523,0.7746,0.48,0.7902]],"QD1":[[0.3179,0.7919,0.3563,0.8076],[0.3115,0.5335,0.3498,0.5492]],"U5":[[0.7686,0.6159,0.7954,0.6315]],"U6":[[0.3414,0.6715,0.3682,0.6871]],"M5":[[0.408,0.5996,0.4373,0.6153],[0.3894,0.5766,0.4179,0.5923]],"U9":[[0.2651,0.6028,0.292,0.6185]],"F6":[[0.2436,0.5611,0.2688,0.5768]],"B5":[[0.1379,0.6585,0.1639,0.6742]]},"c79":{"U5":[[0.445,0.262,0.4635,0.2734],[0.3395,0.6159,0.3664,0.6315]],"LS6":[[0.5614,0.3188,0.5957,0.3344]],"S7":[[0.7902,0.46,0.8162,0.4757]],"Y1":[[0.165,0.7317,0.1911,0.7473]],"Y3":[[0.2484,0.7317,0.2745,0.7473]],"Y4":[[0.3303,0.7317,0.3563,0.7473]],"Y5":[[0.4128,0.7317,0.4389,0.7473]],"Y6":[[0.4964,0.7317,0.5225,0.7473]],"Y9":[[0.5781,0.7317,0.6041,0.7473]],"Y7":[[0.6615,0.7317,0.6876,0.7473]],"Y8":[[0.744,0.7317,0.7701,0.7473]]},"c80":{"U3":[[0.2779,0.3032,0.3047,0.3188]],"JC1":[[0.439,0.3502,0.4732,0.3658]]},"c82":{"P1":[[0.3565,0.2278,0.3825,0.2435]],"KS1":[[0.4487,0.2752,0.4845,0.2908]],"H5":[[0.8195,0.3083,0.8464,0.3239]],"LS7":[[0.8236,0.3637,0.8579,0.3793]],"TS66":[[0.7026,0.3764,0.7459,0.3921]],"CB2":[[0.3321,0.4083,0.3688,0.4239]],"U5":[[0.769,0.62,0.7959,0.6357]],"U6":[[0.3419,0.6757,0.3687,0.6913]],"QD1":[[0.3184,0.7961,0.3568,0.8117],[0.312,0.5377,0.3503,0.5534]],"M5":[[0.4085,0.6038,0.4377,0.6195],[0.3899,0.5808,0.4184,0.5964]],"U9":[[0.2656,0.607,0.2925,0.6227]],"F6":[[0.2441,0.5653,0.2693,0.581]],"B5":[[0.1384,0.6627,0.1644,0.6783]],"LS8":[[0.8236,0.4272,0.8579,0.4429]],"G6":[[0.4528,0.7838,0.4805,0.7995]]},"c83":{"U5":[[0.4456,0.2639,0.4641,0.2753],[0.3401,0.6177,0.3669,0.6334]],"KS1":[[0.7943,0.2685,0.8178,0.2799]],"LS6":[[0.562,0.3206,0.5963,0.3363]],"S7":[[0.7937,0.4618,0.8198,0.4775]],"Y1":[[0.1655,0.7335,0.1916,0.7491]],"Y3":[[0.2489,0.7335,0.275,0.7491]],"Y4":[[0.3308,0.7335,0.3568,0.7491]],"Y5":[[0.4134,0.7335,0.4394,0.7491]],"Y6":[[0.497,0.7335,0.523,0.7491]],"Y9":[[0.5798,0.7335,0.6059,0.7491]],"Y7":[[0.6621,0.7335,0.6881,0.7491]],"Y8":[[0.7446,0.7335,0.7707,0.7491]]},"c84":{},"c85":{},"h90":{"Y7":[[0.4223,0.2237,0.4413,0.2365]],"Y9":[[0.3174,0.3359,0.3365,0.3487]],"Y3":[[0.5834,0.4142,0.6024,0.427]],"Y4":[[0.4469,0.4145,0.4659,0.4273]],"Y1":[[0.7875,0.4342,0.8065,0.447]],"Y5":[[0.847,0.4784,0.8661,0.4912]],"Y6":[[0.6925,0.4785,0.7115,0.4913]],"Y8":[[0.3049,0.5894,0.3239,0.6022]],"LIFT_CYL":[[0.2887,0.2784,0.3518,0.2912]],"UP_CYL":[[0.1839,0.2995,0.2746,0.3111]],"DRV_L":[[0.7125,0.2978,0.748,0.3106]],"DRV_R":[[0.8292,0.295,0.8647,0.3078]],"BRK_MAN":[[0.5522,0.2509,0.62,0.2753]],"MANIFOLD":[[0.6963,0.5847,0.862,0.6042]],"PUMP":[[0.2148,0.7022,0.2803,0.715]],"M5":[[0.2148,0.7022,0.2803,0.715]],"TANK":[[0.2882,0.749,0.3742,0.7618]],"FILTER":[[0.4577,0.7053,0.4918,0.7162]],"STEER_CYL":[[0.4985,0.2904,0.5366,0.3032],[0.553,0.2904,0.5911,0.3032]]},"h91":{"Y7":[[0.4223,0.2237,0.4413,0.2365]],"Y9":[[0.3174,0.346,0.3365,0.3588]],"Y3":[[0.5834,0.4142,0.6024,0.427]],"Y4":[[0.4469,0.4145,0.4659,0.4273]],"Y1":[[0.7875,0.4342,0.8065,0.447]],"Y5":[[0.847,0.4784,0.8661,0.4912]],"Y6":[[0.6925,0.4785,0.7115,0.4913]],"Y8":[[0.3049,0.5894,0.3239,0.6022]],"LIFT_CYL":[[0.359,0.1693,0.422,0.1809]],"UP_CYL":[[0.1839,0.3096,0.2746,0.3213]],"DRV_L":[[0.7125,0.2978,0.748,0.3106]],"DRV_R":[[0.8292,0.295,0.8647,0.3078]],"BRK_MAN":[[0.5336,0.2496,0.6192,0.2815]],"MANIFOLD":[[0.6963,0.5847,0.862,0.6042]],"PUMP":[[0.2148,0.7022,0.2803,0.715]],"M5":[[0.2148,0.7022,0.2803,0.715]],"TANK":[[0.2882,0.749,0.3742,0.7618]],"FILTER":[[0.4577,0.7053,0.4918,0.7162]],"STEER_CYL":[[0.4985,0.2904,0.5366,0.3032],[0.553,0.2904,0.5911,0.3032]]},"h92":{"Y7":[[0.427,0.233,0.4461,0.245]],"Y9":[[0.3222,0.3553,0.3412,0.3673]],"Y3":[[0.5881,0.4235,0.6072,0.4356]],"Y4":[[0.4517,0.4238,0.4707,0.4359]],"Y1":[[0.7923,0.4435,0.8112,0.4555]],"Y5":[[0.8518,0.4877,0.8708,0.4997]],"Y6":[[0.6972,0.4878,0.7163,0.4998]],"Y8":[[0.3096,0.5987,0.3287,0.6107]],"LIFT_CYL":[[0.2934,0.2889,0.3566,0.2998]],"UP_CYL":[[0.1886,0.3189,0.2794,0.3299]],"DRV_L":[[0.7172,0.3071,0.7528,0.3191]],"DRV_R":[[0.834,0.3043,0.8695,0.3163]],"BRK_MAN":[[0.5384,0.2613,0.624,0.2894]],"MANIFOLD":[[0.7059,0.6005,0.8715,0.6163]],"PUMP":[[0.2195,0.7115,0.2851,0.7235]],"M5":[[0.2195,0.7115,0.2851,0.7235]],"TANK":[[0.2929,0.7582,0.3789,0.7703]],"FILTER":[[0.4624,0.7146,0.4965,0.7249]],"STEER_CYL":[[0.5033,0.2997,0.5413,0.3118],[0.5578,0.2997,0.5959,0.3118]]},"h93":{"Y35":[[0.2915,0.2934,0.3155,0.3054]],"Y36":[[0.7098,0.2934,0.7338,0.3054]],"Y39":[[0.4268,0.4064,0.4508,0.4185]],"Y40":[[0.5654,0.4065,0.5894,0.4185]],"Y33":[[0.2965,0.5412,0.3205,0.5532]],"Y34":[[0.7104,0.5412,0.7344,0.5532]],"OUT_LF":[[0.1617,0.2545,0.2371,0.2665]],"OUT_RF":[[0.7826,0.2548,0.8595,0.2668]],"OUT_LR":[[0.1657,0.5024,0.2421,0.5145]],"OUT_RR":[[0.7823,0.5027,0.8602,0.5148]],"OUT_MAN":[[0.5307,0.3699,0.608,0.3835]]},"w6":{"KS1":[[0.7352,0.1872,0.7682,0.2018]],"CB2":[[0.6506,0.1881,0.6843,0.2028]],"G6":[[0.7512,0.2432,0.7769,0.2578]],"TS66":[[0.752,0.2876,0.7916,0.3022]],"P1":[[0.7388,0.3324,0.763,0.3471]],"H5":[[0.3693,0.4283,0.3961,0.4454],[0.3693,0.6314,0.3961,0.6485]],"LS6":[[0.223,0.4401,0.2572,0.4572],[0.223,0.6433,0.2572,0.6604]],"S7":[[0.1262,0.4528,0.1522,0.4699],[0.1262,0.6559,0.1522,0.673]]},"w7":{"JC1":[[0.3769,0.2982,0.4102,0.315]],"U36":[[0.5694,0.6389,0.6035,0.6557]]}};
  function cmp(a,b){return a[0]-b[0]||a[1]-b[1]}
  function parseSerial(v){const m=/GS\s?(\d\d)(\d\d)\s?[A-D]?\s?-?\s?(\d+)/i.exec(v||'');return m?{ser:m[1],key:[+m[2],+m[3]]}:null}
  function inRange(r,k){return r&&cmp(k,r[0])>=0&&(!r[1]||cmp(k,r[1])<=0)}
  let matchK=null,curId=null,lastFocus=null;
  const ser=()=>MODELS[S.model].ser;
  const imgs={};
  const load=k=>imgs[k]||(imgs[k]=new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=IMG_URL(k)}));

  /* ---- aba Esquemas: lista por tipo ---- */
  function build(){
    const s=ser(),groups={};
    SCHEMS.filter(x=>x.rng[s]).forEach(x=>(groups[x.kd]=groups[x.kd]||[]).push(x));
    $('#schList').innerHTML=Object.keys(groups).map(g=>`<h4>${g}</h4>`+groups[g].map((x,i)=>{const pg=x.pg[s],m=matchK&&matchK.ser===s&&inRange(x.rng[s],matchK.key)&&x.rng[s][0][0]>0;
      return `<div class="it${m?' match':''}"><b>${x.t}</b><small>Série: ${x.lbl[s]}${m?' · é a sua versão':''}</small><div class="pg"><button class="all" data-p="${pg.join(',')}" data-t="${x.t} (${x.lbl[s]})">Abrir tudo</button>${pg.map(k=>`<button data-p="${k}" data-t="${x.t}, pág. ${PGN(k)}">Pág. ${PGN(k)}</button>`).join('')}</div></div>`}).join('')).join('');
    $$('#schList [data-p]').forEach(b=>b.onclick=()=>open(b.dataset.p.split(','),b.dataset.t,S.sel))}
  function go(){const v=$('#serial').value.trim(),p=parseSerial(v),msg=$('#serialMsg');
    if(!p){matchK=null;msg.textContent=v?'Não entendi o número de série. Use o formato GS4607-83000.':'';build();if(S.sel)renderInfo();Store.save();return}
    const want=ser();
    if(p.ser!==want){matchK=null;msg.textContent=p.ser==='32'?'Esse número é de GS-3232. Troque o modelo no topo.':p.ser==='46'?'Esse número é de GS-2046, GS-2646 ou GS-3246. Troque o modelo no topo.':'Série fora de GS-2046, GS-2646, GS-3246 e GS-3232.';build();if(S.sel)renderInfo();Store.save();return}
    matchK=p;build();const n=$$('#schList .it.match').length;
    msg.textContent=n?`Série ${v.toUpperCase()}: ${n} esquema(s) marcado(s) abaixo.`:(p.ser==='32'?'O manual só traz esquemas do GS-3232 a partir de GS3207-84867.':'Nenhuma faixa do manual cobre esse número.');
    if(S.sel)renderInfo();Store.save()}
  $('#serialGo').onclick=go;$('#serial').addEventListener('keydown',e=>{if(e.key==='Enter')go()});

  /* ---- versão vigente de cada esquema: a do nº de série digitado, senão a mais recente ---- */
  function chosen(){const s=ser(),by={},out=[];
    SCHEMS.filter(x=>x.rng[s]).forEach(x=>(by[x.t]=by[x.t]||[]).push(x));
    for(const t in by){const c=by[t];let v=null;if(matchK&&matchK.ser===s)v=c.find(x=>x.rng[s][0][0]>0&&inRange(x.rng[s],matchK.key));out.push({e:v||c[c.length-1],exact:!!v})}
    return out}
  function pagesFor(id){const s=ser(),out=[];
    for(const {e,exact} of chosen()){const hit=e.pg[s].filter(k=>HOT[k]&&HOT[k][id]);hit.forEach(k=>out.push({k,t:e.t,lbl:e.lbl[s],set:e.pg[s],exact}))}
    return out}

  /* ---- painel "Peça": miniaturas recortadas com o símbolo circulado ---- */
  function infoSection(id){
    const L=pagesFor(id),r=REG[id];
    if(!L.length)return `<h4>No esquema do manual</h4><p class="note">${r.code} não tem símbolo próprio nos esquemas elétrico e hidráulico do manual (é peça estrutural ou só aparece em desenhos de procedimento).</p>`;
    const note=matchK&&matchK.ser===ser()?'Versão do número de série digitado, quando houver. Senão, a mais recente.':'Mostrando a versão mais recente. Digite o número de série na aba Esquemas para trocar de versão.';
    const noteX=S.model==='2046'?' Os esquemas do manual de serviço cobrem GS-2646 e GS-3246; para o GS-2046 confira a faixa de série.':'';
    return `<h4>No esquema do manual</h4><p class="note">${note}${noteX} Toque numa miniatura para abrir a página inteira; os símbolos da página também são clicáveis.</p>
      <div class="thumbs sc">${L.map(x=>`<button class="th" data-k="${x.k}" data-set="${x.set.join(',')}" data-t="${x.t} (${x.lbl})" aria-label="Abrir ${x.t}, página ${PGN(x.k)}, com ${r.code} destacado"><canvas width="540" height="225" aria-hidden="true"></canvas><span>${x.t} · pág. ${PGN(x.k)}<small>${x.lbl}</small></span></button>`).join('')}</div>`}
  function drawCrop(cv,img,boxes){
    const W=img.naturalWidth,H=img.naturalHeight,cw=cv.width,ch=cv.height;
    const x0=Math.min(...boxes.map(b=>b[0])),y0=Math.min(...boxes.map(b=>b[1])),x1=Math.max(...boxes.map(b=>b[2])),y1=Math.max(...boxes.map(b=>b[3]));
    const cx=(x0+x1)/2*W,cy=(y0+y1)/2*H,sw=W*.5,sh=sw*ch/cw;
    const sx=clamp(cx-sw/2,0,W-sw),sy=clamp(cy-sh/2,0,H-sh),k=cw/sw,g=cv.getContext('2d');
    g.fillStyle='#fff';g.fillRect(0,0,cw,ch);g.drawImage(img,sx,sy,sw,sh,0,0,cw,ch);
    g.lineWidth=3;g.strokeStyle='#d6249f';g.fillStyle='rgba(214,36,159,.14)';
    for(const b of boxes){const x=(b[0]*W-sx)*k,y=(b[1]*H-sy)*k,w=(b[2]-b[0])*W*k,h=(b[3]-b[1])*H*k;
      if(x+w<0||x>cw||y+h<0||y>ch)continue;
      const px=Math.max(6,(26-w)/2),py=Math.max(6,(16-h)/2);
      g.beginPath();if(g.roundRect)g.roundRect(x-px,y-py,w+2*px,h+2*py,8);else g.rect(x-px,y-py,w+2*px,h+2*py);g.fill();g.stroke()}}
  function hydrate(id){
    $$('#p-info .th').forEach(b=>{const k=b.dataset.k;
      b.onclick=()=>open(b.dataset.set.split(','),b.dataset.t,id,k);
      load(k).then(img=>{if(S.sel===id&&b.isConnected)drawCrop(b.querySelector('canvas'),img,HOT[k][id])}).catch(()=>{})})}

  /* ---- janela com a página inteira, símbolos clicáveis e foco no componente ---- */
  function pageHTML(k,t){
    const boxes=HOT[k]||{};
    const hs=Object.keys(boxes).filter(id=>REG[id]&&inModel(REG[id])).flatMap(id=>boxes[id].map(b=>`<button class="hs${id===curId?' cur':''}" data-id="${id}" style="left:${b[0]*100}%;top:${b[1]*100}%;width:${(b[2]-b[0])*100}%;height:${(b[3]-b[1])*100}%" aria-label="${REG[id].code}: ${REG[id].name}" title="${REG[id].code} · ${REG[id].name}"></button>`)).join('');
    return `<div class="pgw" data-k="${k}"><img alt="${t}, página ${PGN(k)}" src="${IMG_URL(k)}">${hs}</div>`}
  function setSel(id){$$('#mI .hs').forEach(b=>b.classList.toggle('cur',b.dataset.id===id));const r=id&&REG[id];$('#mSel').textContent=r?`${r.code} · ${r.name}`:'';$('#mGo').hidden=!r}
  function open(keys,t,id,scrollKey){
    curId=id&&REG[id]?id:null;lastFocus=document.activeElement;
    $('#mI').innerHTML=keys.map(k=>pageHTML(k,t)).join('');$('#mTitle').textContent=t;
    $('#modal').hidden=false;zoom('fit');setSel(curId);
    $$('#mI .hs').forEach(b=>b.onclick=()=>{curId=b.dataset.id;select(curId,false);setSel(curId);A11y.say(REG[curId].code+', '+REG[curId].name)});
    $('#mX').focus();
    const c=(scrollKey&&$(`#mI .pgw[data-k="${scrollKey}"] .hs.cur`))||$('#mI .hs.cur');
    if(c)requestAnimationFrame(()=>c.scrollIntoView({block:'center',inline:'center'}))}
  function close(){$('#modal').hidden=true;if(lastFocus&&lastFocus.focus&&lastFocus.isConnected)lastFocus.focus()}
  function zoom(m){$$('#mI .pgw').forEach(p=>{p.style.width=m==='fit'?'min(100%,900px)':m})}
  $('#mX').onclick=close;$('#mZ1').onclick=()=>zoom('fit');$('#mZ2').onclick=()=>zoom('1800px');$('#mZ3').onclick=()=>zoom('2700px');
  $('#mGo').onclick=()=>{const id=curId;close();if(id&&REG[id])select(id,true)};
  $('#modal').addEventListener('keydown',e=>{ /* foco preso dentro da janela */
    if(e.key==='Escape'){e.preventDefault();close();return}
    if(e.key!=='Tab')return;const f=$$('#modal button:not([hidden]),#modal [tabindex="-1"]').filter(x=>x.tabIndex>=0&&!x.hidden);if(!f.length)return;
    const a=document.activeElement,i=f.indexOf(a);if(e.shiftKey&&i<=0){e.preventDefault();f[f.length-1].focus()}else if(!e.shiftKey&&i===f.length-1){e.preventDefault();f[0].focus()}});
  return {SCHEMS,HOT,build,go,pagesFor,infoSection,hydrate,open,close,parseSerial,inRange,get matchK(){return matchK}}
})();
const buildSchem=()=>Schem.build();

/* ===== 14 · UI · abas (ARIA), painéis recolhíveis, som, comandos e atalhos ===== */
const tabBtns=$$('.tabs [role=tab]'),panes=$$('.pane');let curTab='info';
function tab(t,focus){curTab=t;
  tabBtns.forEach(b=>{const on=b.dataset.t===t;b.setAttribute('aria-selected',on);b.tabIndex=on?0:-1;if(on&&focus)b.focus()});
  panes.forEach(p=>{const on=p.id==='p-'+t;p.classList.toggle('act',on);p.hidden=!on});Store.save()}
$('.tabs').addEventListener('keydown',e=>{const i=tabBtns.indexOf(document.activeElement);if(i<0)return;let n=-1;
  if(e.key==='ArrowRight')n=(i+1)%tabBtns.length;else if(e.key==='ArrowLeft')n=(i-1+tabBtns.length)%tabBtns.length;else if(e.key==='Home')n=0;else if(e.key==='End')n=tabBtns.length-1;
  if(n>=0){e.preventDefault();tab(tabBtns[n].dataset.t,true)}});
tabBtns.forEach(b=>b.onclick=()=>tab(b.dataset.t));

const Panels={is:n=>!$('#app').classList.contains('hide-'+n),
  set(n,open,quiet){$('#app').classList.toggle('hide-'+n,!open);const b=$('#'+n+'Btn');b.setAttribute('aria-pressed',open);b.setAttribute('aria-expanded',open);if(!quiet)Store.save()}};
$('#ctlBtn').onclick=()=>Panels.set('ctl',!Panels.is('ctl'));$('#sideBtn').onclick=()=>Panels.set('side',!Panels.is('side'));

function setSound(v,quiet){Sound.set(v);const b=$('#sndBtn');b.setAttribute('aria-pressed',v);b.textContent=v?'♪ Som: lig.':'♪ Som: desl.';
  b.setAttribute('aria-label',v?'Som ligado. Desativar som':'Som desligado. Ativar som');if(!quiet){Store.save();A11y.say(v?'Som ligado':'Som desligado')}}
$('#sndBtn').onclick=()=>setSound(!Sound.enabled);
['pointerdown','keydown'].forEach(ev=>addEventListener(ev,()=>Sound.unlock(),{passive:true}));   /* libera o áudio no 1º gesto */

/* ---------- comandos ---------- */
function seg(sel,attr,fn){const bs=$$(sel+' button');bs.forEach(b=>b.onclick=()=>{bs.forEach(x=>x.setAttribute('aria-pressed',x===b));fn(b.dataset[attr],b);Store.save()})}
seg('#keySeg','k',(v,b)=>{S.key=v;A11y.say('Chave KS1: '+b.textContent)});seg('#modeSeg','m',(v,b)=>{S.mode=v;A11y.say('Modo: '+b.textContent)});seg('#spdSeg','s',v=>S.speedx=+v);
const tog=(id,fn)=>$(id).onclick=function(){const v=this.getAttribute('aria-pressed')!=='true';this.setAttribute('aria-pressed',v);fn(v);Store.save()};
tog('#estop',v=>{S.estop=v;A11y.say(v?'Parada de emergência acionada':'Parada de emergência liberada')});
tog('#qd1',v=>{S.qd1=v;$('#qd1').textContent=v?'Bateria conectada (QD1)':'Bateria desconectada (QD1)';A11y.say(v?'Bateria conectada':'Bateria desconectada')});
tog('#torque',v=>S.torque=v);
$('#roll').oninput=e=>{S.roll=+e.target.value;$('#rollV').textContent=S.roll+'°'};$('#pitch').oninput=e=>{S.pitch=+e.target.value;$('#pitchV').textContent=S.pitch+'°'};
$('#uRange').oninput=e=>{S.u=e.target.value/100;scissor()};
$('#btnExt').onclick=e=>{platFx.eT=platFx.eT?0:1;e.currentTarget.setAttribute('aria-pressed',!!platFx.eT);A11y.say(platFx.eT?'Extensão do piso abrindo':'Extensão do piso recolhendo')};
$('#btnGate').onclick=e=>{platFx.gT=platFx.gT?0:1;e.currentTarget.setAttribute('aria-pressed',!!platFx.gT);A11y.say(platFx.gT?'Portinhola aberta':'Portinhola fechada')};

/* botões "segure para acionar": mouse, toque (captura do ponteiro) e teclado (Espaço/Enter) */
function bindHold(b,k){
  const on=e=>{if(e.type==='keydown'&&(e.repeat||(e.key!==' '&&e.key!=='Enter')))return;e.preventDefault();S.held[k]=1;b.classList.add('on');b.setAttribute('aria-pressed','true')};
  const off=()=>{S.held[k]=0;b.classList.remove('on');b.setAttribute('aria-pressed','false')};
  b.addEventListener('pointerdown',e=>{try{b.setPointerCapture(e.pointerId)}catch(_){}on(e)});
  ['pointerup','pointercancel','lostpointercapture','blur'].forEach(ev=>b.addEventListener(ev,off));
  b.addEventListener('keydown',on);b.addEventListener('keyup',e=>{if(e.key===' '||e.key==='Enter')off()});
  b.addEventListener('contextmenu',e=>e.preventDefault())}
$$('[data-hold]').forEach(b=>bindHold(b,b.dataset.hold));
const KM={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'};
addEventListener('keydown',e=>{
  if(e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return;
  const t=document.activeElement;if(t&&t.closest&&t.closest('input,select,textarea,[role=tablist]'))return;   /* setas navegam abas e campos */
  if(!$('#modal').hidden)return;
  if(KM[e.key]){S.held[KM[e.key]]=1;e.preventDefault()}
  else if(e.key==='m'||e.key==='M')setSound(!Sound.enabled)});
addEventListener('keyup',e=>{if(KM[e.key])S.held[KM[e.key]]=0});
addEventListener('blur',()=>{for(const k in S.held)S.held[k]=0});

/* camadas, carcaça, rótulos, vistas */
let layerMode='all',shellVal='0.16';
function setLayer(m,quiet){layerMode=m;$$('[data-mode]').forEach(x=>x.setAttribute('aria-pressed',x.dataset.mode===m));
  ['hyd','ele','mec'].forEach(c=>world.classList.remove('mode-'+c));if(m!=='all')world.classList.add('mode-'+m);if(!quiet)Store.save()}
$$('[data-mode]').forEach(b=>b.onclick=()=>{setLayer(b.dataset.mode);A11y.say('Camada: '+b.textContent)});
function setShell(v,quiet){shellVal=v;$$('[data-shell]').forEach(x=>x.setAttribute('aria-pressed',x.dataset.shell===v));world.style.setProperty('--so',v);chassis.style.display=v==='0'?'none':'';if(!quiet)Store.save()}
$$('[data-shell]').forEach(b=>b.onclick=()=>setShell(b.dataset.shell));
function setPins(v,quiet){$('#pinsBtn').setAttribute('aria-pressed',v);stage.classList.toggle('nopins',!v);world.classList.toggle('nopins',!v);if(!quiet)Store.save()}
$('#pinsBtn').onclick=function(){setPins(this.getAttribute('aria-pressed')!=='true')};
$$('[data-view]').forEach(b=>b.onclick=()=>view(b.dataset.view));
world.style.setProperty('--so','.16');

/* persistência: o que é salvo e como é restaurado (valores validados) */
Store.collect=()=>({model:S.model,key:S.key,mode:S.mode,speed:S.speedx,torque:S.torque,layer:layerMode,shell:shellVal,pins:!stage.classList.contains('nopins'),
  tab:curTab,ctl:Panels.is('ctl'),side:Panels.is('side'),sound:Sound.enabled,tmode:Touch.mode,serial:$('#serial').value});
function restorePrefs(sv){
  Store.quiet=true;
  try{
    const click=s=>{const b=$(s);if(b)b.click()};
    if(['off','ground','platform'].includes(sv.key))click(`#keySeg [data-k="${sv.key}"]`);
    if(['lift','drive'].includes(sv.mode))click(`#modeSeg [data-m="${sv.mode}"]`);
    if([1,5,10].includes(sv.speed))click(`#spdSeg [data-s="${sv.speed}"]`);
    if(typeof sv.torque==='boolean'&&sv.torque!==S.torque)click('#torque');
    if(['all','hyd','ele','mec'].includes(sv.layer))setLayer(sv.layer,true);
    if(['0.5','0.16','0'].includes(sv.shell))setShell(sv.shell,true);
    if(typeof sv.pins==='boolean')setPins(sv.pins,true);
    if(['info','live','list','fault','doc'].includes(sv.tab))tab(sv.tab);
    if(typeof sv.ctl==='boolean')Panels.set('ctl',sv.ctl,true);
    if(typeof sv.side==='boolean')Panels.set('side',sv.side,true);
    if(typeof sv.sound==='boolean')setSound(sv.sound,true);
    if(['camera','operation'].includes(sv.tmode))Touch.set(sv.tmode,true);
    if(typeof sv.serial==='string'&&sv.serial.length<40&&sv.serial){$('#serial').value=sv.serial;Schem.go()}
  }finally{Store.quiet=false}}


/* ===== 11 · LOGIC · lógica do ECM (hidráulica/elétrica) e passo da simulação ===== */
function powered(){return S.key!=='off'&&!S.estop&&S.qd1}
function outrOK(){return S.oext>=1&&S.lev>=1&&!S.eos}
function ecm(){
  const o={Y8:0,Y7:0,Y9:0,Y6:0,Y5:0,Y3:0,Y4:0,Y1:0,H5:0,FB:0,pump:0,Y39:0,Y40:0,Y33:0,Y34:0,Y35:0,Y36:0},h=S.held,w={up:0,down:0,fwd:0,rev:0,left:0,right:0};
  if(powered()){
    if(S.key==='platform'){if(S.mode==='lift'){w.up=h.up;w.down=h.down}else{w.fwd=h.up;w.rev=h.down}w.left=h.left;w.right=h.right}
    else{w.up=h.up;w.down=h.down}
    const f=S.fault;
    if(f==='54'||S.u>=1)w.up=0;if(f==='55'||S.u<=0)w.down=0;if(f==='52')w.fwd=0;if(f==='53')w.rev=0;if(f==='56'||f==='43')w.right=0;if(f==='57'||f==='42')w.left=0;
    if(S.tilt){w.up=0;w.fwd=0;w.rev=0}
    let od={ext:0,ret:0};
    if(S.model==='3232'){
      od.ext=(h.oen&&h.oex&&!h.ore&&f!=='CW'&&!(S.oext>=1&&(S.lev>=1||S.eos)))?1:0;
      od.ret=(h.oen&&h.ore&&!h.oex&&f!=='CCW'&&S.u<=.03&&(S.oext>0||S.lev>0))?1:0;
      if(S.oext>.02||od.ext||od.ret){w.fwd=w.rev=w.left=w.right=0}
      if(!outrOK())w.up=0}
    o.Y8=w.up;o.Y7=o.Y9=w.down;o.Y6=w.fwd;o.Y5=w.rev;o.Y3=w.right;o.Y4=w.left;
    o.Y1=(S.torque&&(w.fwd||w.rev))?1:0;
    o.pump=(w.up||w.fwd||w.rev||w.left||w.right)?1:0;
    if(S.model==='3232'){o.Y40=od.ext;o.Y39=od.ret;const on=(od.ext||od.ret)?1:0;o.Y33=o.Y34=o.Y35=o.Y36=on;if(on)o.pump=1}
    o.H5=(w.down||S.tilt||(S.fault&&S.fault!=='68'&&S.flash%1<.5))?1:0;
    o.FB=1;o._w=w}
  else o._w=w;
  return o}
function step(dt){
  S.flash+=dt*1.6;
  const o=ecm(),w=o._w;S.out=o;S.pump=!!o.pump;
  const MD=MODELS[S.model];
  if(o.Y8)S.u=clamp(S.u+dt*S.speedx/MD.tUp,0,1);
  if(o.Y7)S.u=clamp(S.u-dt*S.speedx/MD.tDown,0,1);
  if(S.model==='3232'){
    if(o.Y40){if(S.oext<1)S.oext=Math.min(1,S.oext+dt*S.speedx/10);else if(S.lev<1&&!S.eos){S.lev=Math.min(1,S.lev+dt*S.speedx/6);if((Math.abs(S.roll)>5||Math.abs(S.pitch)>3)&&S.lev>=.6){S.lev=.6;S.eos=true}}}
    if(o.Y39){S.eos=false;if(S.lev>0)S.lev=Math.max(0,S.lev-dt*S.speedx/4);else S.oext=Math.max(0,S.oext-dt*S.speedx/10)}}
  const raised=S.u>.03;
  let vmax=raised?.8:(S.torque?1.8:3.5);
  const dir=o.Y6?1:o.Y5?-1:0;const vt=dir*vmax;S.v=lerp(S.v,vt,clamp(dt*3,0,1));
  if(w.right)S.steer=clamp(S.steer+dt*28,-28,28);if(w.left)S.steer=clamp(S.steer-dt*28,-28,28);
  const vps=S.v/3.6*150; /* px/s */
  S.wheel+=vps/30/D*dt;S.psi+=vps/300*Math.tan(S.steer*D)*dt;S.px+=vps*Math.cos(S.psi)*dt;S.pz+=vps*Math.sin(S.psi)*dt;
  if(o.pump)S.mspin+=dt*900;
  const pT=o.Y8?70+S.u*90:o.Y6||o.Y5?(o.Y1?130:80):(o.Y3||o.Y4)?60:(o.Y39||o.Y40)?100:o.Y7?8:0;S.P=lerp(S.P,pT,clamp(dt*4,0,1));
  const sag=o.pump?(1.1+(o.Y1?.5:0)):0;S.V=lerp(S.V,(S.fault==='68'?20.8:25.4)-sag-(S.qd1?0:25.4),clamp(dt*3,0,1));
  if(!S.qd1)S.V=Math.max(0,S.V);
}
/* ===== 12 · RENDER · aplicação do estado na cena (escritas só quando mudam) ===== */
function setLit(n,on,color){if(n._lit===on&&(!on||n._col===color))return;n._lit=on;n.classList.toggle('lit',on);if(color&&n._col!==color){n._col=color;n.style.setProperty('--lit',color)}}
function render(){
  const o=S.out,pw=powered();
  const dir=o.Y6?1:o.Y5?-1:0;
  const st=(id,s)=>lineSt(id,s);
  /* hidráulico */
  const press=S.pump;
  st('h_suct',press?'f':'');st('h_press',press?'f':'');if(S.model==='3232'){st('h_pA',press?'f':'');st('h_pB',(press&&!(o.Y39||o.Y40)||press&&(o.Y8||o.Y6||o.Y5||o.Y3||o.Y4))?'f':'');const os=o.Y40?'f':o.Y39?'r':'';['LF','RF','LR','RR'].forEach(k=>st('h_o'+k,os))}
  st('h_ret',(o.Y7||o.Y6||o.Y5||o.Y3||o.Y4)?'f':'');st('h_retf',(o.Y7||o.Y6||o.Y5||o.Y3||o.Y4)?'f':'');
  st('h_lift',o.Y8?'f':o.Y7?'r':'');st('h_upper',o.Y8?'f':o.Y9?'r':'');
  st('h_steerL',o.Y3?'f':o.Y4?'r':'');st('h_steerR',o.Y4?'f':o.Y3?'r':'');
  st('h_dLf',dir>0?'f':dir<0?'r':'');st('h_dLr',dir<0?'f':dir>0?'r':'');st('h_dRf',dir>0?'f':dir<0?'r':'');st('h_dRr',dir<0?'f':dir>0?'r':'');
  st('h_brk',dir?'f':'');st('h_brkL',dir?'f':'');st('h_brkR',dir?'f':'');st('h_acc',(o.Y3||o.Y4||dir)?'f':'');
  /* elétrico */
  const live=S.qd1;
  st('e_bat',live?'live':'');st('e_main',live?'live':'');st('e_main2',live?'live':'');st('e_neg',live?'live':'');
  st('e_motor',press?'f':live?'live':'');st('e_chg','');
  st('e_ctl',pw?'f':'');st('e_ctl2',pw?'live':'');st('e_bus',pw?'live':'');
  for(const k in coils)st('e_'+k,o[k]?'f':pw?'live':'');
  st('e_Y7',o.Y7?'f':pw?'live':'');st('e_Y9',o.Y9?'f':pw?'live':'');
  st('e_cab',pw&&S.key==='platform'?'f':pw?'live':'');
  for(const k of ['S7','LS6','LS7','LS8','G6'])st('e_'+k,pw?'f':'');
  st('e_H5',o.H5?'f':pw?'live':'');st('e_FB',pw?'f':'');
  if(S.model==='3232'){for(const k of ['Y39','Y40'])st('e_o_'+k,o[k]?'f':pw?'live':'');for(const k of ['LF','RF','LR','RR'])st('e_o_'+k,o['Y'+({LF:35,RF:36,LR:33,RR:34}[k])]?'f':pw?'live':'');for(const k of ['PT1','PT2','PT3','PT4','S8','kp','mc','LS5'])st('e_o_'+k,pw?'f':'');
    for(const k of ['Y39','Y40','Y33','Y34','Y35','Y36'])setLit(REG[k].node,!!o[k],'#ffd43b');renderOut()}
  /* peças */
  for(const k of ['Y8','Y4','Y3','Y1','Y6','Y5','Y7','Y9'])setLit(REG[k].node,!!o[k],'#ffd43b');
  const fl=(S.flash%1)<.5;
  setLit(REG.H5.node,!!o.H5&&fl,'#ff5d5d');setLit(REG.FB.node,pw&&fl,'#ffb347');
  setLit(L16,pw&&S.key==='platform'&&S.mode==='lift','#7ee081');setLit(L17,pw&&S.key==='platform'&&S.mode==='drive','#7ee081');setLit(L21,pw&&S.torque,'#ffd43b');
  setLit(REG.U5.node,pw,'#59ff8a');setLit(REG.S7.node,S.tilt,'#ff5d5d');
  setLit(REG.BRK_L.node,!!dir,'#ff7a3d');setLit(REG.BRK_R.node,!!dir,'#ff7a3d');
  setTf(mrot,`rotateX(${(S.mspin%360).toFixed(0)}deg)`);
  /* rodas e chão */
  const wr=(S.wheel%360).toFixed(1),sr=(-S.steer).toFixed(2);
  for(const k in wheels){const w=wheels[k];setTf(w.sp,`rotateZ(${wr}deg)`);if(w.steer)setTf(w.st,`rotateY(${sr}deg)`)}
  setTf(tie,`translate3d(143px,-30px,${(S.steer/28*10).toFixed(2)}px)`);
  setTf(gw,`rotateY(${(S.psi/D).toFixed(2)}deg)`);const bp=`${(1300-S.px).toFixed(1)}px ${(1300-S.pz).toFixed(1)}px`;if(gp._bp!==bp){gp._bp=bp;gp.style.backgroundPosition=bp}
  if(S.model!=='3232'&&root._t){setTf(root,'');setTf(ground,'');root._t=0}
  /* HUD */
  setTx($c('#hUp'),(S.u*100).toFixed(0));setW($c('#hUpB'),(S.u*100).toFixed(1)+'%');
  setTx($c('#hP'),S.P.toFixed(0));setW($c('#hPB'),Math.min(100,S.P/255*100).toFixed(1)+'%');
  setTx($c('#hV'),S.V.toFixed(1));setTx($c('#hSp'),Math.abs(S.v).toFixed(1));
  const dg=$('#diag'),f=S.fault,fx=f&&FB[f]&&FB[f][6];dg.classList.toggle('err',!!f&&!fx&&pw);
  setTx($c('#diagTx'),!pw?'--':(f&&!fx)?f:'OK');
  /* lâmpadas */
  const lamps=[['Energia',pw,''],['Bomba',S.pump,'o'],['Alarme',!!o.H5,'r'],['Torque alto',S.torque&&pw,'y'],['Freio solto',!!dir,'o'],['Plataforma elevada',S.u>.03,''],['Desnivelado',S.tilt,'r']].concat(S.model==='3232'?[['Estabilizadores',S.oext>.02,'y'],['Nivelada',S.lev>=1,'y'],['Elevação habilitada',outrOK()&&pw,'']]:[]);
  const lh=lamps.map(l=>`<span class="lamp ${l[1]?'on '+l[2]:''}" role="listitem" aria-label="${l[0]}: ${l[1]?'ativo':'inativo'}">${l[0]}</span>`).join('');
  if(lh!==lampsH){lampsH=lh;$c('#lamps').innerHTML=lh}
  const padT=!pw?'Gire a chave e libere a emergência para operar.':S.key==='ground'?'Solo: ▲ ▼ sobem e descem pela chave TS66.':S.mode==='lift'?'Elevação: ▲ sobe, ▼ desce. ◀ ▶ esterçam.':'Movimento: ▲ avança, ▼ ré. ◀ ▶ esterçam.';
  const oCapT=`Estabilizadores ${Math.round(S.oext*100)}% · nivelamento ${Math.round(S.lev*100)}%`+(S.eos?' · FIM DE CURSO: declive acima do limite do manual':'')+(outrOK()?' · elevação habilitada':'')+(S.oext>.02?' · movimento e direção desativados':'');
  setTx($c('#padCap'),padT);setTx($c('#oCap'),oCapT);
  const uv=(S.u*100).toFixed(1),ur=$c('#uRange');if(ur._v!==uv){ur._v=uv;ur.value=uv;ur.setAttribute('aria-valuetext',Math.round(S.u*100)+' por cento')}
}
function renderOut(){
  const pw=powered(),T=performance.now()/1000,sr=Math.sin(S.roll*D),sp=Math.sin(S.pitch*D),g={};
  const gm=Math.max(...Object.keys(OUTP).map(k=>g[k]=OUTP[k][1]*sr-OUTP[k][0]*sp));
  for(const k in OUTP)setTf(feet[k],`translate3d(0,${(S.lev>0?22+S.lev*(gm-g[k]):S.oext*22).toFixed(2)}px,0)`);
  setTf(root,`translate3d(0,${(-S.lev*gm).toFixed(2)}px,0) rotateX(${(S.roll*(1-S.lev)).toFixed(3)}deg) rotateZ(${(S.pitch*(1-S.lev)).toFixed(3)}deg)`);setTf(ground,`rotateX(${S.roll}deg) rotateZ(${S.pitch}deg)`);root._t=1;
  const ok=outrOK(),keys=['LF','RF','LR','RR'],R='#ff5d5d',G='#4ade80',L={};
  keys.forEach(k=>L[k]=!pw?null:(S.oext>=1?G:R));L.EN=pw&&ok?G:null;L.ER=pw&&!ok?R:null;
  let alarm=false;
  if(pw&&S.eos){let w=keys[0];keys.forEach(k=>{if(g[k]<g[w])w=k});L[w]=R;alarm=true}
  const f=S.fault&&FB[S.fault]&&FB[S.fault][6];
  if(f&&pw){const cyc=T%3;
    if(f.lamp){L[f.lamp]=(cyc<f.n*.5&&(cyc%.5)<.25)?R:null}
    else if(f.alt){const a=Math.floor(T*2)%2;keys.forEach(k=>L[k]=null);(f.alt==='fb'?(a?['LR','RR']:['LF','RF']):(a?['RF','RR']:['LF','LR'])).forEach(k=>L[k]=R)}
    else if(f.cw){const od=['LF','RF','RR','LR'];if(f.cw<0)od.reverse();keys.forEach(k=>L[k]=null);L[od[Math.floor(T*3)%4]]=R}
    else if(f.allred){keys.forEach(k=>L[k]=R);L.ER=R;L.EN=null;alarm=true}}
  for(const k in KLAMP)setLit(KLAMP[k],!!L[k],L[k]||'#000');
  setLit(H8n,alarm&&(T%.5<.25),R);setLit(REG.U42.node,pw,'#59ff8a');setLit(REG.U36.node,false)}
let sysTick=0;
function updateSys(){
  const o=S.out,names=[['Y8','Subida'],['Y7','Descida'],['Y9','Descida 2'],['Y6','Avanço'],['Y5','Ré'],['Y3','Giro dir.'],['Y4','Giro esq.'],['Y1','Paralelo'],['H5','Alarme'],['FB','Pisca']].concat(S.model==='3232'?[['Y40','Estender'],['Y39','Retrair'],['Y33','Est. TE'],['Y34','Est. TD'],['Y35','Est. DE'],['Y36','Est. DD']]:[]);
  const oh=names.map(([k,t])=>`<div class="out ${o[k]?'on':''}"><span>${t}</span><b>${k}</b></div>`).join('');if(oh!==outsH){outsH=oh;$c('#outs').innerHTML=oh}
  let h='Nenhuma função ativa. Bomba parada, sem fluxo.',e=powered()?'Bateria 24 V → fusível F6 → controlador U6 em espera. Disjuntor CB2 → chave KS1 → ECM U5 energizado.':'Sem energia de comando. Gire KS1, libere a emergência e conecte a bateria.';
  if(o.Y8){h='Motor M5 gira a bomba. Óleo sai pela porta P, passa pela válvula AI (Y8 energizada) e vai ao cilindro de elevação. AJ limita a pressão. A bobina Y7 fica fechada e segura a carga.';e='ECM pino A6 energiza Y8 e comanda o U6 (pinos A8 e A9). O U6 liga o motor M5 com 24 V.'}
  else if(o.Y7){h='Y7 e Y9 abrem os cilindros. O óleo volta por gravidade pelo orifício calibrado e pelo distribuidor até o tanque, passando pelo filtro. O motor não gira. O alarme H5 soa.';e='ECM pino B6 energiza Y7 (e Y9) e o alarme H5 no pino B9.'}
  else if(o.Y6||o.Y5){h=`Pressão chega à válvula AG (${o.Y6?'Y6 avanço':'Y5 ré'}) e aos motores de acionamento. A válvula AF (3,4 bar) libera os freios.${o.Y1?' Y1 (AE) coloca os motores em paralelo para mais torque.':''}`;e=`ECM pino ${o.Y6?'C6':'A7'} energiza ${o.Y6?'Y6':'Y5'}. O U6 liga o motor M5.`}
  else if(o.Y40||o.Y39){h=`A bomba entrega óleo ao distribuidor dos estabilizadores (IN). A válvula BA (${o.Y40?'Y40 estende':'Y39 retrai'}) envia o óleo aos quatro cilindros, cujas válvulas CA a CD estão abertas. BB limita a 241 bar. O restante sai por OUT.`;e=`O ECM dos estabilizadores U42 energiza ${o.Y40?'Y40 (pino C4)':'Y39 (pino C3)'} e Y33 a Y36, e liga o controlador do motor.`}
  else if(o.Y3||o.Y4){h=`Óleo passa pelo regulador AH (2,8 L/min, 103 bar), pelo disco AD e pela válvula AC (${o.Y3?'Y3 direita':'Y4 esquerda'}) até o cilindro de direção.`;e=`ECM pino ${o.Y3?'C7':'B7'} energiza ${o.Y3?'Y3':'Y4'}. O U6 liga o motor M5.`}
  setTx($c('#hydTxt'),h);setTx($c('#eleTxt'),e)}

/* ===== 15 · LOOP DE ANIMAÇÃO ===== */
let t0=performance.now(),frame=0;
document.addEventListener('visibilitychange',()=>{t0=performance.now()});
function platAnim(dt){const f=platFx,k=1-Math.exp(-dt*3.5);let ch=false;
  if(f.e!==f.eT){f.e=Math.abs(f.eT-f.e)<.002?f.eT:f.e+(f.eT-f.e)*k;ch=true}
  if(f.g!==f.gT){f.g=Math.abs(f.gT-f.g)<.002?f.gT:f.g+(f.gT-f.g)*k;ch=true}
  if(ch||!f._i){f._i=1;setTf(f.ext,`translate3d(${(f.e*134).toFixed(1)}px,0,0)`);setTf(f.extR,`translate3d(0,-8px,0) scale3d(1,${Math.max(.001,f.e).toFixed(3)},1)`);setTf(f.gate,`translate3d(-166px,-8px,-83px) rotateY(${(-105*f.g).toFixed(1)}deg)`)}}
function loop(t){
  const dt=Math.min(.1,(t-t0)/1000);t0=t;
  step(dt);platAnim(dt);
  const k=1-Math.exp(-dt*6);
  /* inércia da câmera depois de soltar o arraste */
  if(!ptrs.size&&(Math.abs(vel.x)>.5||Math.abs(vel.y)>.5)){tgt.ry+=vel.x*dt;tgt.rx=clamp(tgt.rx+vel.y*dt,-90,8);const d=Math.exp(-dt*4);vel.x*=d;vel.y*=d}
  /* suavização exponencial independente da taxa de quadros, com "snap" para a câmera repousar (sem escrita no DOM) */
  for(const p of CAMK){const e=p==='zoom'?.0005:(p==='rx'||p==='ry')?.01:.05;cam[p]=Math.abs(tgt[p]-cam[p])<e?tgt[p]:lerp(cam[p],tgt[p],k)}
  if(!S.sel&&!S.fault&&!ptrs.size&&tgt.rx>-80){const g=autoTy();tgt.ty=Math.abs(g-tgt.ty)<.05?g:lerp(tgt.ty,g,.05)}
  if(autoZ&&!S.sel&&!S.fault){if(lastAutoZ&&Math.abs(tgt.zoom-lastAutoZ)>1e-6)autoZ=false;else{const z=VIEWS[curView].z*bz()*fitZ();tgt.zoom=lastAutoZ=z}}
  applyCam();
  if(S.u!==S._u){scissor();S._u=S.u}
  render();
  Sound.update(S,S.out,powered(),S.flash%1<.5);
  if(++frame%6===0){liveInfo();updateSys()}
  requestAnimationFrame(loop)}

/* ===== 16 · INICIALIZAÇÃO ===== */
const saved=Store.load();
Store.quiet=true;
setModel(MODELS[saved.model]?saved.model:'3246');buildSchem();updateSys();Object.assign(cam,tgt);
S.key='platform';$$('#keySeg button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.k==='platform'));
Store.quiet=false;
restorePrefs(saved);
setTx($c('#padCap'),'Gire a chave e libere a emergência para operar.');
booted=true;
requestAnimationFrame(loop);
/* seleção programável por URL hash simples */
if(location.hash.length>1){const id=decodeURIComponent(location.hash.slice(1));if(REG[id])setTimeout(()=>select(id,true),100)}

/* ===== API de depuração/testes (não usada pela interface) ===== */
window.GS={S,REG,LN,GEO,MODELS,FAULTS,FOUT,FB,Store,Sound,Touch,A11y,Schem,
  Scene:{node,box,cyl,pin,setSeg},Camera:{cam,tgt,view,focusOn,applyCam},
  Logic:{ecm,step,powered,outrOK},Render:{render,renderOut,updateSys},
  UI:{select,tab,setModel,setFault,Panels,setSound,setLayer,setShell,setPins}};

})();
