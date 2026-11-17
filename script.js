const previewCanvas=document.getElementById('previewCanvas'),previewCtx=previewCanvas.getContext('2d');const outputCanvas=document.getElementById('mixCanvas'),outputCtx=outputCanvas.getContext('2d');const tracksElement=document.getElementById('tracks'),clipGridElement=document.getElementById('clipGrid'),mediaList=document.getElementById('mediaList'),videoInput=document.getElementById('videoInput'),importStatus=document.getElementById('importStatus');const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));const supportedVideo=/\.(mp4|m4v|webm|mov|ogv|ogg|mkv|avi)$/i;let rustCore=null;import('./pkg/vj_core.js').then(async module=>{await module.default();rustCore=module;}).catch(()=>{});const PROJECT_KEY='vj-studio-project-v1';let savedProject=null;try{savedProject=JSON.parse(localStorage.getItem(PROJECT_KEY)||'null')}catch(e){}const state={tracks:[],selectedId:null,activeColumns:savedProject?.activeColumns||{},gridColumns:savedProject?.gridColumns||4,strobe:.42,strobeRate:4,crossfade:50,visualizerStyle:'bars',micGain:12,micSensitivity:2,noiseFloor:.012,micEnabled:false,micStream:null,audioContext:null,analyser:null,timeData:null,freqData:null,micLevel:0,micPeak:0,lastBeat:0,lastAbove:false,prevBass:0,bassFloor:0.012,strobeUntil:0,beatBpm:0,beatPeriod:0,beatConfidence:0,lastBeatAt:0,nextBeatAt:0,lastOnsetAt:0,prevSpectrum:null,spectrumPrimed:false,floatFreqData:null,fluxMean:.25,fluxDeviation:.8,bassNoiseDb:-94,strobePulseUntil:0,lastStrobeAt:-1e9,outputWindow:null,screens:[],chromaEnabled:false,chromaColor:'#00ff00',chromaTolerance:35,filterPreset:'none',visualizerRect:{x:.1,y:.68,w:.8,h:.25},drag:null};
let browserEngine=null;
import('./browser-engine.js').then(m=>{browserEngine=m.initBrowserEngine({state,render,status,saveProject:()=>saveProject(),savedProject});}).catch(e=>status('Browser Engine konnte nicht geladen werden: '+e.message,true));
function status(message,error=false){importStatus.textContent=message;importStatus.classList.toggle('error',error)}function fitRect(v,w,h){const ratio=v.videoWidth/v.videoHeight,target=w/h;let dw=w,dh=h;if(ratio>target)dh=w/ratio;else dw=h*ratio;return{x:(w-dw)/2,y:(h-dh)/2,w:dw,h:dh}}function backdrop(ctx,c){const g=ctx.createLinearGradient(0,0,c.width,c.height);g.addColorStop(0,'#171627');g.addColorStop(.52,'#13181d');g.addColorStop(1,'#071716');ctx.fillStyle=g;ctx.fillRect(0,0,c.width,c.height)}function rgb(hex){return{r:parseInt(hex.slice(1,3),16),g:parseInt(hex.slice(3,5),16),b:parseInt(hex.slice(5,7),16)}}
const FILTERS={none:'none',cinema:'contrast(1.18) saturate(.82) sepia(.12)',vivid:'contrast(1.16) saturate(1.65)',mono:'grayscale(1)',noir:'grayscale(1) contrast(1.55)',dream:'brightness(1.12) saturate(1.35)',warm:'sepia(.28) saturate(1.25)',cool:'hue-rotate(18deg) saturate(1.18)',invert:'invert(1)'};
function detectCanvasFilter(){try{const c=document.createElement('canvas');c.width=c.height=1;const x=c.getContext('2d',{willReadFrequently:true});x.fillStyle='#fff';x.fillRect(0,0,1,1);x.filter='invert(1)';x.fillRect(0,0,1,1);x.filter='none';return x.getImageData(0,0,1,1).data[0]<32;}catch(e){return false;}}
const CANVAS_FILTER_SUPPORTED=detectCanvasFilter();
function applyFallbackFilter(ctx,canvas,v,preset){
 if(!ctx||!v.videoWidth||!v.videoHeight)return null;
 const scale=Math.min(1,640/Math.max(v.videoWidth,v.videoHeight)),w=Math.max(1,Math.round(v.videoWidth*scale)),h=Math.max(1,Math.round(v.videoHeight*scale));
 if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;canvas._vjKey='';}
 const cacheKey=v.currentTime+'|'+preset;
 if(canvas._vjKey===cacheKey)return canvas;
 const filter=FILTERS[preset];
 if(!filter)return null;
 ctx.save();
 try{
  ctx.clearRect(0,0,w,h);
  if(CANVAS_FILTER_SUPPORTED){
   ctx.filter=filter;
   ctx.drawImage(v,0,0,w,h);
   ctx.restore();
   canvas._vjKey=cacheKey;
   return canvas;
  }
  ctx.filter='none';
  ctx.drawImage(v,0,0,w,h);
  const im=ctx.getImageData(0,0,w,h),p=im.data,cl=x=>Math.max(0,Math.min(255,x));
  for(let i=0;i<p.length;i+=4){
   let r=p[i],g=p[i+1],b=p[i+2],y=.2126*r+.7152*g+.0722*b;
   switch(preset){
    case'mono':r=g=b=y;break;
    case'noir':r=g=b=cl((y-128)*1.65+128);break;
    case'invert':r=255-r;g=255-g;b=255-b;break;
    case'vivid':{const sat=1.75,con=1.18;r=cl(((y+(r-y)*sat)-128)*con+128);g=cl(((y+(g-y)*sat)-128)*con+128);b=cl(((y+(b-y)*sat)-128)*con+128);break;}
    case'warm':{const nr=.393*r+.769*g+.189*b,ng=.349*r+.686*g+.168*b,nb=.272*r+.534*g+.131*b;r=cl(nr);g=cl(ng);b=cl(nb);break;}
    case'cool':r=cl(r*.88);g=cl(g*1.02);b=cl(b*1.22+10);break;
    case'dream':r=cl(r*1.12+16);g=cl(g*1.10+12);b=cl(b*1.08+18);break;
    case'cinema':{const sat=.82,con=1.18;r=cl(((y+(r-y)*sat)-128)*con+128+10);g=cl(((y+(g-y)*sat)-128)*con+128+5);b=cl(((y+(b-y)*sat)-128)*con+128);break;}
   }
   p[i]=r;p[i+1]=g;p[i+2]=b;
  }
  ctx.putImageData(im,0,0);
  ctx.restore();
  canvas._vjKey=cacheKey;
  return canvas;
 }catch(error){
  ctx.restore();
  // If pixel access is blocked, try the browser's native Canvas filter as a second path.
  try{
   ctx.save();
   ctx.clearRect(0,0,w,h);
   ctx.filter=filter;
   ctx.drawImage(v,0,0,w,h);
   ctx.restore();
   canvas._vjKey=cacheKey;
   return canvas;
  }catch(fallbackError){
   try{ctx.restore()}catch(restoreError){}
   canvas._vjKey='';
   return null;
  }
 }
}
function drawClip(ctx,t,c,mix=1){
 const v=t.video;
 if(!t.visible||v.readyState<HTMLMediaElement.HAVE_CURRENT_DATA||!v.videoWidth)return;
 const box={x:t.x*c.width,y:t.y*c.height,w:t.w*c.width,h:t.h*c.height},preset=t.filterPreset||state.filterPreset||'none';
 let source=v,nativeFilter=false;
 if(preset!=='none'){
  const fc=t.filterCanvas||(t.filterCanvas=document.createElement('canvas'));
  const filtered=applyFallbackFilter(fc.getContext('2d',CANVAS_FILTER_SUPPORTED?{}:{willReadFrequently:true}),fc,v,preset);
  if(filtered)source=filtered;
  else{
   nativeFilter=true;
   if(t.filterErrorPreset!==preset){t.filterErrorPreset=preset;status('Filter-Fallback nicht verfügbar. Der Browser versucht den Effekt direkt beim Rendern.',true);}
  }
 }else t.filterErrorPreset='';
 if(state.chromaEnabled){
  const maxSide=640,scale=Math.min(1,maxSide/Math.max(v.videoWidth,v.videoHeight)),w=Math.max(1,Math.round(v.videoWidth*scale)),h=Math.max(1,Math.round(v.videoHeight*scale));
  const off=t.keyCanvas||(t.keyCanvas=document.createElement('canvas'));
  if(off.width!==w||off.height!==h){off.width=w;off.height=h;t.keyTime='';}
  const k=off.getContext('2d',{willReadFrequently:true}),keyCache=v.currentTime+'|'+preset+'|'+state.chromaColor+'|'+state.chromaTolerance;
  let keyReady=t.keyTime===keyCache;
  if(!keyReady){
   try{
    k.save();k.clearRect(0,0,w,h);k.filter=nativeFilter?(FILTERS[preset]||'none'):'none';k.drawImage(source,0,0,w,h);k.filter='none';k.restore();
    const im=k.getImageData(0,0,w,h),p=im.data,key=rgb(state.chromaColor),tol=state.chromaTolerance*2.2;
    for(let i=0;i<p.length;i+=4){const dr=p[i]-key.r,dg=p[i+1]-key.g,db=p[i+2]-key.b,dist=Math.sqrt(dr*dr+dg*dg+db*db);if(dist<tol)p[i+3]=0;else if(dist<tol+28)p[i+3]=Math.min(p[i+3],Math.round(255*(dist-tol)/28));}
    k.putImageData(im,0,0);t.keyTime=keyCache;keyReady=true;
   }catch(error){
    try{k.restore()}catch(restoreError){}
    t.keyTime='';
    if(t.keyError!==true){t.keyError=true;status('Chroma Key konnte das Bild nicht auslesen; der Clip wird ohne Key angezeigt.',true);}
   }
  }
  if(keyReady){source=off;nativeFilter=false;}
 }
 ctx.save();
 const blendOps={normal:'source-over',add:'lighter',screen:'screen',multiply:'multiply',overlay:'overlay',difference:'difference',lighten:'lighten',darken:'darken',subtract:'difference'};
 ctx.globalCompositeOperation=blendOps[t.blendMode||'normal']||'source-over';
 ctx.globalAlpha=t.opacity*mix*(t.audioReactive?clamp(.35+state.micLevel*.65,0,1):1);
 ctx.beginPath();ctx.rect(box.x,box.y,box.w,box.h);ctx.clip();
 ctx.filter=nativeFilter?(FILTERS[preset]||'none'):'none';
 const r=fitRect(v,box.w,box.h);ctx.drawImage(source,box.x+r.x,box.y+r.y,r.w,r.h);
 ctx.restore();
}
function drawVisualizer(ctx,c,time){if(state.visualizerStyle==='off')return;const r=state.visualizerRect,x=r.x*c.width,y=r.y*c.height,w=r.w*c.width,h=r.h*c.height,base=y+h*.9,n=64;ctx.save();ctx.globalCompositeOperation='screen';if(state.visualizerStyle==='wave'){ctx.beginPath();for(let i=0;i<=n;i++){const xx=x+i/n*w,val=state.timeData?Math.abs((state.timeData[Math.floor(i/n*(state.timeData.length-1))]-128)/128):(Math.sin(time*.004+i*.2)+1)*.12,yy=y+h*.82-val*h*.72-state.micLevel*h*.18;i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy)}ctx.strokeStyle='#55e8d7';ctx.shadowColor='#39d9c5';ctx.shadowBlur=14;ctx.lineWidth=Math.max(2,h*.025);ctx.stroke()}else if(state.visualizerStyle==='circle'){const cx=x+w/2,cy=y+h/2,radius=Math.min(w,h)*.18;for(let i=0;i<n;i++){const a=i/n*Math.PI*2-Math.PI/2,val=state.freqData?state.freqData[Math.floor(i/n*state.freqData.length)]/255:(Math.sin(time*.003+i*.3)+1)*.12,outer=radius+val*h*.4+state.micLevel*h*.15;ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*radius,cy+Math.sin(a)*radius);ctx.lineTo(cx+Math.cos(a)*outer,cy+Math.sin(a)*outer);ctx.strokeStyle=i%2?'#bd70ff':'#54e6d5';ctx.lineWidth=Math.max(2,h*.025);ctx.stroke()}}else{const bw=w/n;for(let i=0;i<n;i++){const val=state.freqData?state.freqData[Math.floor(i/n*state.freqData.length)]/255:(Math.sin(time*.003+i*.24)+1)*.12,env=state.visualizerStyle==='spectrum'?Math.pow(1-i/n,.45):1,bh=Math.max(h*.04,(val*.78+state.micLevel*.3)*h*env),g=ctx.createLinearGradient(0,base-bh,0,base);g.addColorStop(0,'#ff487d');g.addColorStop(.5,'#bd70ff');g.addColorStop(1,'#39d9c5');ctx.fillStyle=g;ctx.fillRect(x+i*bw+bw*.16,base-bh,bw*.68,bh)}}ctx.restore();ctx.save();ctx.strokeStyle='rgba(209,255,56,.65)';ctx.setLineDash([8,6]);ctx.strokeRect(x,y,w,h);ctx.setLineDash([]);ctx.fillStyle='#d1ff38';ctx.fillRect(x+w-12,y+h-12,12,12);ctx.restore()}
function drawStrobe(ctx,time){if(!state.strobe||!state.tracks.some(t=>t.visible&&t.strobe&&(state.activeColumns[t.layerId||t.id]??0)===Number(t.column||0)))return;const period=1000/state.strobeRate,mic=state.micEnabled&&time<state.strobePulseUntil,free=!state.micEnabled&&(time%period)<55;if(!mic&&!free)return;const alpha=clamp(state.strobe*(mic?.82+state.micPeak*.18:.7),0,.96);ctx.save();ctx.globalCompositeOperation='screen';ctx.fillStyle=`rgba(255,255,255,${alpha})`;ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);ctx.restore()}
function scene(ctx,c,time,preview=false){backdrop(ctx,c);if(preview){const t=state.tracks.find(x=>x.id===state.selectedId);if(t){drawClip(ctx,t,c);drawSelectionOverlay(ctx,c,t);}else{ctx.fillStyle='#999';ctx.font='600 28px system-ui';ctx.textAlign='center';ctx.fillText('Wähle einen Clip aus der Bibliothek',c.width/2,c.height/2)}return}const solo=state.tracks.some(t=>t.solo),vis=state.tracks.filter(t=>t.visible&&(!solo||t.solo)&&(state.activeColumns[t.layerId||t.id]??0)===Number(t.column||0)),a=vis.filter(t=>t.deck==='A'),b=vis.filter(t=>t.deck==='B'),raw=state.crossfade/100,f=raw*raw*(3-2*raw);a.forEach(t=>drawClip(ctx,t,c,b.length?1-f:1));b.forEach(t=>drawClip(ctx,t,c,a.length?f:1));drawVisualizer(ctx,c,time);drawStrobe(ctx,time);if(!vis.length){ctx.fillStyle='#999';ctx.font='600 28px system-ui';ctx.textAlign='center';ctx.fillText('Clips auf Deck A oder B laden',c.width/2,c.height/2)}}
function check(label,cls,t,checked){const l=document.createElement('label'),i=document.createElement('input');i.type='checkbox';i.className=cls;i.dataset.id=t.id;i.checked=checked;l.append(i,document.createTextNode(label));return l}function range(label,cls,t,value){const l=document.createElement('label');l.className='track-range';l.append(document.createTextNode(`${label} ${Math.round(value*100)}%`));const i=document.createElement('input');i.type='range';i.min='0';i.max='1';i.step='.01';i.value=value;i.className=cls;i.dataset.id=t.id;l.append(i);return l}function action(text,what,t,title){const b=document.createElement('button');b.type='button';b.textContent=text;b.dataset.action=what;b.dataset.id=t.id;b.title=title;return b}
function renderTracks(){tracksElement.replaceChildren();mediaList.replaceChildren();document.getElementById('mediaCount').textContent=state.tracks.length;if(!state.tracks.length){for(const parent of [tracksElement,mediaList]){const e=document.createElement('div');e.className='empty';e.textContent=parent===tracksElement?'Videos, Bilder, Kameras oder Generatoren hinzufügen.':'Deine Medien erscheinen hier.';parent.append(e)}return}state.tracks.forEach((t,index)=>{const row=document.createElement('article');row.className=`track${t.id===state.selectedId?' selected':''}`;const title=document.createElement('div');title.className='track-title-wrap';const num=document.createElement('span');num.className='track-number';num.textContent=String(index+1).padStart(2,'0');const stack=document.createElement('div');stack.style.minWidth='0';const name=document.createElement('div');name.className='track-title';name.textContent=t.name;const sub=document.createElement('div');sub.className='track-subtitle';sub.textContent=`LAYER ${String([...new Set(state.tracks.map(x=>x.layerId||x.id))].indexOf(t.layerId||t.id)+1).padStart(2,'0')} · SLOT ${Number(t.column||0)+1} · DECK ${t.deck}${t.error?' · '+t.error:''}`;stack.append(name,sub);title.append(num,stack);const toggles=document.createElement('div');toggles.className='track-toggles';toggles.append(check('On','track-visible',t,t.visible),check('Solo','track-solo',t,!!t.solo),check('Audio','track-audio',t,!!t.audioReactive),check('Strobe','track-strobe',t,t.strobe));const controls=document.createElement('div');controls.className='track-actions';const deck=document.createElement('select');deck.className='deck-select';deck.dataset.id=t.id;deck.innerHTML=`<option value="A" ${t.deck==='A'?'selected':''}>A</option><option value="B" ${t.deck==='B'?'selected':''}>B</option>`;const blend=document.createElement('select');blend.className='track-blend';blend.dataset.id=t.id;blend.title='Blend mode';blend.innerHTML=['normal','add','screen','multiply','overlay','difference','lighten','darken','subtract'].map(v=>'<option value="'+v+'" '+((t.blendMode||'normal')===v?'selected':'')+'>'+v.toUpperCase()+'</option>').join('');const sync=document.createElement('select');sync.className='track-sync';sync.dataset.id=t.id;sync.title='Beat sync';sync.innerHTML='<option value="0">FREE</option>'+[.25,.5,1,2,4,8,16,32].map(v=>'<option value="'+v+'" '+(Number(t.syncBeats||0)===v?'selected':'')+'>'+v+' BEATS</option>').join('');const mode=document.createElement('select');mode.className='track-playmode';mode.dataset.id=t.id;mode.title='Clip playback mode';mode.innerHTML=['loop','once-clear','once-hold'].map(v=>'<option value="'+v+'" '+((t.playMode||'loop')===v?'selected':'')+'>'+({loop:'LOOP','once-clear':'ONCE → CLEAR','once-hold':'ONCE → HOLD'}[v])+'</option>').join('');const autopilot=document.createElement('select');autopilot.className='track-autopilot';autopilot.dataset.id=t.id;autopilot.title='Autopilot';autopilot.innerHTML=['off','next','previous','random'].map(v=>'<option value="'+v+'" '+((t.autopilot||'off')===v?'selected':'')+'>'+v.toUpperCase()+'</option>').join('');const effect=document.createElement('select');effect.className='track-effect';effect.dataset.id=t.id;effect.title='Layer effect';effect.innerHTML='<option value="inherit">GLOBAL FX</option>'+['cinema','vivid','mono','noir','dream','warm','cool','invert'].map(v=>'<option value="'+v+'" '+((t.filterPreset||'')===v?'selected':'')+'>'+v.toUpperCase()+'</option>').join('');controls.append(deck,blend,sync,mode,autopilot,effect,action('−','shrink',t,'Layer um 10 % verkleinern'),action('+','enlarge',t,'Layer um 10 % vergrößern'),action(t.id===state.selectedId?'Preview ✓':'Preview','select',t,'Preview'));const del=action('×','remove',t,'Entfernen');del.className='delete';controls.append(del,action('↑','up',t,'Nach vorne'),action('↓','down',t,'Nach hinten'));row.append(title,toggles,range('Deckkraft','track-opacity',t,t.opacity),range('Lautstärke','track-volume',t,t.volume),controls);tracksElement.append(row);const item=document.createElement('div');item.className=`media-item${t.id===state.selectedId?' selected':''}`;item.dataset.id=t.id;item.draggable=true;item.innerHTML=`<span class="media-thumb">${t.error?'!':'▶'}</span><span style="min-width:0"><span class="media-name"></span><span class="media-meta">DECK ${t.deck}</span></span>`;item.querySelector('.media-name').textContent=t.name;mediaList.append(item)})}

function gridGroups(){const map=new Map();state.tracks.forEach(t=>{t.layerId=t.layerId||t.id;t.column=Number.isInteger(t.column)?t.column:0;if(!map.has(t.layerId))map.set(t.layerId,[]);map.get(t.layerId).push(t)});return [...map.entries()]}
function launchGridClip(layerId,column,clip){state.activeColumns[layerId]=column;if(clip){clip.visible=true;state.selectedId=clip.id;clip.video?.play?.().catch?.(()=>{});}render();saveProject();}
function launchGridColumn(column){for(const [layerId,clips] of gridGroups()){const clip=clips.find(t=>Number(t.column||0)===column);state.activeColumns[layerId]=clip?column:-1;if(clip){clip.visible=true;clip.video?.play?.().catch?.(()=>{});}}render();saveProject();status(`Spalte ${column+1} gestartet.`)}
function placeClipInSlot(moved,layerId,column,clips=[]){const occupied=clips.find(t=>t.id!==moved.id&&Number(t.column||0)===column);if(occupied){let free=0;while(clips.some(t=>t.id!==moved.id&&t.id!==occupied.id&&Number(t.column||0)===free)||free===column)free++;occupied.column=free;}moved.layerId=layerId;moved.column=column;moved.deck=clips[0]?.deck||'A';launchGridClip(layerId,column,moved);status(`${moved.name} in Spalte ${column+1} abgelegt.`)}
function renderClipGrid(){
 if(!clipGridElement)return;clipGridElement.replaceChildren();
 const groups=gridGroups(),maxColumn=Math.max(state.gridColumns,...state.tracks.map(t=>Number(t.column||0)+1),1);clipGridElement.style.setProperty('--grid-columns',maxColumn);
 const head=document.createElement('div');head.className='clip-grid-row clip-grid-head';
 const label=document.createElement('div');label.className='clip-grid-layer-label';label.textContent='LAYER';head.append(label);
 for(let c=0;c<maxColumn;c++){const b=document.createElement('button');b.type='button';b.className='clip-grid-column';b.textContent=String(c+1);b.title=`Spalte ${c+1} starten (Taste ${c+1<=9?c+1:'—'})`;b.addEventListener('click',()=>launchGridColumn(c));head.append(b)}
 clipGridElement.append(head);
 if(!groups.length){const empty=document.createElement('div');empty.className='clip-grid-empty';empty.textContent='Medien importieren und hier als Layer oder Clip-Slot ablegen.';clipGridElement.append(empty)}
 groups.forEach(([layerId,clips],index)=>{
  const row=document.createElement('div');row.className='clip-grid-row';row.dataset.layer=layerId;
  const layerLabel=document.createElement('div');layerLabel.className='clip-grid-layer-label';layerLabel.innerHTML=`<b> LAYER ${String(index+1).padStart(2,'0')}</b><small></small>`;layerLabel.querySelector('small').textContent=clips[0]?.name||'Layer';row.append(layerLabel);
  for(let c=0;c<maxColumn;c++){
   const clip=clips.find(t=>Number(t.column||0)===c),cell=document.createElement('button');cell.type='button';cell.className='clip-grid-cell'+(clip?' filled':' empty-slot')+((state.activeColumns[layerId]??0)===c?' active':'');cell.dataset.layer=layerId;cell.dataset.column=String(c);
   if(clip){cell.dataset.clip=clip.id;const title=document.createElement('b');title.textContent=clip.name;const meta=document.createElement('small');meta.textContent=(clip.type||'video').toUpperCase()+(clip.error?' · FEHLER':'');cell.append(title,meta);cell.title=`${clip.name} · Layer ${index+1}, Spalte ${c+1}`;cell.addEventListener('click',()=>launchGridClip(layerId,c,clip));cell.addEventListener('contextmenu',e=>{e.preventDefault();state.selectedId=clip.id;render();status(`Preview ausgewählt: ${clip.name}`)});}
   else{cell.textContent='＋';cell.title=`Leerer Slot · Clip auswählen und antippen oder hier ablegen`;cell.addEventListener('click',()=>{const picked=state.tracks.find(t=>t.id===state.selectedId);if(picked)placeClipInSlot(picked,layerId,c,clips);});}
   cell.addEventListener('dragover',e=>{e.preventDefault();cell.classList.add('drop-target')});cell.addEventListener('dragleave',()=>cell.classList.remove('drop-target'));cell.addEventListener('drop',e=>{e.preventDefault();cell.classList.remove('drop-target');const id=e.dataTransfer.getData('text/vj-clip');const moved=state.tracks.find(t=>t.id===id);if(!moved)return;placeClipInSlot(moved,layerId,c,clips);});
   row.append(cell);
  }
  clipGridElement.append(row);
 });
 const newRow=document.createElement('div');newRow.className='clip-grid-new-layer';newRow.textContent='＋ Neue Layer-Zeile · Clip hier ablegen';newRow.addEventListener('dragover',e=>{e.preventDefault();newRow.classList.add('drop-target')});newRow.addEventListener('dragleave',()=>newRow.classList.remove('drop-target'));newRow.addEventListener('drop',e=>{e.preventDefault();newRow.classList.remove('drop-target');const moved=state.tracks.find(t=>t.id===e.dataTransfer.getData('text/vj-clip'));if(!moved)return;moved.layerId=globalThis.crypto?.randomUUID?.()||`layer-${Date.now()}`;moved.column=0;moved.deck='A';launchGridClip(moved.layerId,0,moved);status(`${moved.name} als neuer Layer hinzugefügt.`)});clipGridElement.append(newRow);
}
function render(){renderTracks();renderClipGrid()}
document.getElementById('addGridColumn')?.addEventListener('click',()=>{state.gridColumns=Math.min(16,state.gridColumns+1);render();saveProject();});
mediaList.addEventListener('dragstart',e=>{const item=e.target.closest('.media-item');if(!item)return;e.dataTransfer.setData('text/vj-clip',item.dataset.id);e.dataTransfer.effectAllowed='move';});
function setLayerProp(t,key,value){for(const x of state.tracks)if((x.layerId||x.id)===(t.layerId||t.id)){x[key]=value;if(key==='volume'&&x.video)x.video.volume=value;}}
tracksElement.addEventListener('input',e=>{const c=e.target,t=state.tracks.find(x=>x.id===c.dataset.id);if(!t)return;if(c.classList.contains('track-visible'))setLayerProp(t,'visible',c.checked);if(c.classList.contains('track-solo'))setLayerProp(t,'solo',c.checked);if(c.classList.contains('track-audio'))setLayerProp(t,'audioReactive',c.checked);if(c.classList.contains('track-strobe'))setLayerProp(t,'strobe',c.checked);if(c.classList.contains('track-opacity'))setLayerProp(t,'opacity',+c.value);if(c.classList.contains('track-volume'))setLayerProp(t,'volume',+c.value);if(c.type==='checkbox')render();});tracksElement.addEventListener('change',e=>{const t=state.tracks.find(x=>x.id===e.target.dataset.id);if(e.target.classList.contains('deck-select')&&t){setLayerProp(t,'deck',e.target.value);render();}if(e.target.classList.contains('track-blend')&&t){setLayerProp(t,'blendMode',e.target.value);saveProject();}if(e.target.classList.contains('track-sync')&&t){t.syncBeats=+e.target.value;saveProject();}if(e.target.classList.contains('track-playmode')&&t){t.playMode=e.target.value;t.video.loop=t.playMode==='loop';saveProject();}if(e.target.classList.contains('track-autopilot')&&t){t.autopilot=e.target.value;saveProject();}if(e.target.classList.contains('track-effect')&&t){t.filterPreset=e.target.value==='inherit'?'':e.target.value;saveProject();}});tracksElement.addEventListener('click',e=>{const b=e.target.closest('button[data-action]');if(!b)return;const i=state.tracks.findIndex(t=>t.id===b.dataset.id);if(i<0)return;const a=b.dataset.action;if(a==='enlarge'||a==='shrink'){const t=state.tracks[i],members=state.tracks.filter(x=>(x.layerId||x.id)===(t.layerId||t.id)),factor=a==='enlarge'?1.1:1/1.1,nw=clamp(t.w*factor,.15,1),nh=clamp(t.h*factor,.15,1),cx=t.x+t.w/2,cy=t.y+t.h/2,nx=clamp(cx-nw/2,0,1-nw),ny=clamp(cy-nh/2,0,1-nh);members.forEach(x=>{x.w=nw;x.h=nh;x.x=nx;x.y=ny})}else if(a==='remove'){const[t]=state.tracks.splice(i,1);if(savedProject?.tracks)savedProject.tracks=savedProject.tracks.filter(x=>x.fileName!==(t.fileName||t.name));t.video.pause?.();t.stream?.getTracks().forEach(track=>track.stop());if(t.url)URL.revokeObjectURL(t.url);if(t.id===state.selectedId)state.selectedId=state.tracks[0]?.id||null}else if(a==='select')state.selectedId=state.tracks[i].id;else if(a==='up'||a==='down'){const groups=gridGroups(),gi=groups.findIndex(g=>g[0]===(state.tracks[i].layerId||state.tracks[i].id)),to=gi+(a==='up'?1:-1);if(gi>=0&&to>=0&&to<groups.length){[groups[gi],groups[to]]=[groups[to],groups[gi]];state.tracks=groups.flatMap(g=>g[1]);}}render();});mediaList.addEventListener('click',e=>{const item=e.target.closest('.media-item');if(item){state.selectedId=item.dataset.id;render()}});
videoInput.addEventListener('change',e=>{browserEngine?.addFiles(Array.from(e.target.files||[]));e.target.value=''});
document.getElementById('removeVisualizer').addEventListener('click',()=>{visual.value='off';controls();});const strobe=document.getElementById('strobeIntensity'),rate=document.getElementById('strobeRate'),gain=document.getElementById('visualizerGain'),visual=document.getElementById('visualizerStyle'),cross=document.getElementById('crossfader'),chroma=document.getElementById('chromaEnabled'),chromaColor=document.getElementById('chromaColor'),tolerance=document.getElementById('chromaTolerance');function controls(){state.filterPreset=document.getElementById('filterPreset').value;state.strobe=+strobe.value;state.strobeRate=+rate.value;state.micGain=+gain.value;state.micSensitivity=+document.getElementById('micSensitivity').value;state.visualizerStyle=visual.value;state.crossfade=+cross.value;state.chromaEnabled=chroma.checked;state.chromaColor=chromaColor.value;state.chromaTolerance=+tolerance.value;document.getElementById('strobeValue').value=`${Math.round(state.strobe/.85*100)}%`;document.getElementById('rateValue').value=`${state.strobeRate} Hz`;document.getElementById('gainValue').value=`${state.micGain}×`;document.getElementById('crossfadeValue').value=`A ${100-state.crossfade} / ${state.crossfade} B`;document.getElementById('chromaValue').value=state.chromaTolerance}document.getElementById('filterPreset').addEventListener('change',e=>{state.filterPreset=e.target.value;});[strobe,rate,gain,visual,cross,chroma,chromaColor,tolerance].forEach(i=>{i.addEventListener('input',controls);i.addEventListener('change',controls)});document.getElementById('playAll').addEventListener('click',()=>state.tracks.forEach(t=>t.video.play?.().catch?.(()=>{})));document.getElementById('pauseAll').addEventListener('click',()=>state.tracks.forEach(t=>t.video.pause?.()));
const micButton=document.getElementById('micToggle'),beatReadout=document.getElementById('beatReadout'),micHelp=document.getElementById('micHelp'),micStatus=document.getElementById('micStatus'),meter=document.getElementById('micMeterFill');micButton.addEventListener('click',async()=>{if(state.micEnabled){state.micStream.getTracks().forEach(t=>t.stop());await state.audioContext.close();state.micEnabled=false;resetBeatTracker();state.analyser=null;state.floatFreqData=null;state.freqData=null;state.timeData=null;state.micLevel=0;micButton.classList.remove('active');micButton.innerHTML='◉ <span>Mikrofon aktivieren</span>';micStatus.textContent='MIC OFF';return}if(!navigator.mediaDevices?.getUserMedia){micHelp.textContent='Mikrofon benötigt HTTPS oder localhost.';return}try{state.micStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});const AC=window.AudioContext||window.webkitAudioContext;state.audioContext=new AC();await state.audioContext.resume();state.analyser=state.audioContext.createAnalyser();state.analyser.fftSize=4096;state.analyser.smoothingTimeConstant=.08;state.analyser.minDecibels=-90;state.analyser.maxDecibels=-10;state.audioContext.createMediaStreamSource(state.micStream).connect(state.analyser);state.timeData=new Uint8Array(state.analyser.fftSize);state.freqData=new Uint8Array(state.analyser.frequencyBinCount);state.floatFreqData=new Float32Array(state.analyser.frequencyBinCount);resetBeatTracker();state.micEnabled=true;micButton.classList.add('active');micButton.innerHTML='◉ <span>Mikrofon deaktivieren</span>';micStatus.textContent='MIC LIVE';micHelp.textContent='Mikrofon aktiv. Pegelanzeige reagiert auf Eingangssignal.'}catch(err){micHelp.textContent=err.name==='NotAllowedError'?'Mikrofon blockiert: Browser-Berechtigung erlauben.':'Mikrofon nicht verfügbar. HTTPS und Eingabegerät prüfen.'}});function resetBeatTracker(){
 state.beatBpm=0;state.beatPeriod=0;state.beatConfidence=0;state.lastBeatAt=0;state.nextBeatAt=0;state.lastOnsetAt=0;state.strobePulseUntil=0;state.lastStrobeAt=-1e9;
 state.fluxMean=.25;state.fluxDeviation=.8;state.bassNoiseDb=-94;state.spectrumPrimed=false;
 state.prevSpectrum=state.floatFreqData?new Float32Array(state.floatFreqData.length):null;
 if(state.prevSpectrum)state.prevSpectrum.fill(-100);
}
function registerBeat(now,strength){
 const previous=state.lastBeatAt;
 if(previous){
  const elapsed=now-previous;
  if(elapsed>=260&&elapsed<=2400){
   const steps=state.beatPeriod?clamp(Math.round(elapsed/state.beatPeriod),1,4):1;
   const observed=elapsed/steps;
   if(observed>=280&&observed<=1400){
    if(!state.beatPeriod)state.beatPeriod=observed;
    else{
     const ratio=observed/state.beatPeriod;
     if(ratio>=.72&&ratio<=1.38)state.beatPeriod=state.beatPeriod*.82+observed*.18;
     else if(ratio>=.55&&ratio<=1.8){state.beatPeriod=state.beatPeriod*.9+observed*.1;state.beatConfidence*=.55;}
     else state.beatConfidence*=.45;
    }
    state.beatConfidence=clamp(state.beatConfidence+.22,0,1);
   }
  }else if(elapsed>2400){state.beatPeriod=0;state.beatConfidence=0;}
 }
 state.lastBeatAt=now;
 state.beatBpm=state.beatPeriod?60000/state.beatPeriod:0;
 state.nextBeatAt=state.beatPeriod?now+state.beatPeriod:0;
 if(now-state.lastStrobeAt>70){state.strobePulseUntil=now+38;state.lastStrobeAt=now;}
 state.micPeak=clamp(strength/12,.15,1);
}
function audio(){
 if(!state.analyser){
  state.micLevel*=.9;state.micPeak*=.9;meter.style.width=`${state.micLevel*100}%`;
  beatReadout.textContent='MIC OFF · FREE RATE';return;
 }
 state.analyser.getByteTimeDomainData(state.timeData);
 state.analyser.getByteFrequencyData(state.freqData);
 state.analyser.getFloatFrequencyData(state.floatFreqData);
 let sum=0;for(const v of state.timeData){const sample=(v-128)/128;sum+=sample*sample}
 const rms=Math.sqrt(sum/state.timeData.length),raw=clamp(rms*state.micGain*5,0,1),now=performance.now();
 const binHz=state.audioContext.sampleRate/state.analyser.fftSize;
 const first=Math.max(2,Math.floor(38/binHz)),last=Math.min(state.floatFreqData.length-1,Math.ceil(160/binHz));
 let flux=0,bassDb=0,count=0;
 if(!state.prevSpectrum||state.prevSpectrum.length!==state.floatFreqData.length)resetBeatTracker();
 for(let i=first;i<=last;i++){
  const db=Number.isFinite(state.floatFreqData[i])?state.floatFreqData[i]:-100;
  if(state.spectrumPrimed){
   const rise=Math.max(0,Math.min(24,db-state.prevSpectrum[i]));
   flux+=rise*(i*binHz<110?1.2:.85);
  }
  bassDb+=db;count++;state.prevSpectrum[i]=db;
 }
 state.spectrumPrimed=true;
 flux/=Math.max(1,count);bassDb/=Math.max(1,count);
 if(bassDb<state.bassNoiseDb+10)state.bassNoiseDb=state.bassNoiseDb*.995+bassDb*.005;
 const sensitivity=clamp(state.micSensitivity,.8,4);
 const threshold=Math.max(2.4,state.fluxMean+state.fluxDeviation*(3.4-(sensitivity-.8)*.56));
 const energyGate=Math.max(-86,state.bassNoiseDb+5);
 const onset=bassDb>energyGate&&flux>threshold&&now-state.lastOnsetAt>245;
 if(onset){state.lastOnsetAt=now;registerBeat(now,flux);}
 else if(state.beatPeriod&&state.nextBeatAt&&now>=state.nextBeatAt&&now-state.lastBeatAt<state.beatPeriod*1.65){
  const late=now-state.nextBeatAt,steps=Math.floor(late/state.beatPeriod)+1;
  if(late<state.beatPeriod*.48&&now-state.lastStrobeAt>70){state.strobePulseUntil=now+38;state.lastStrobeAt=now;}
  state.nextBeatAt+=steps*state.beatPeriod;
 }
 if(state.beatPeriod&&now-state.lastBeatAt>Math.max(1900,state.beatPeriod*2.8)){state.beatPeriod=0;state.beatBpm=0;state.beatConfidence=0;state.nextBeatAt=0;}
 const clippedFlux=Math.min(flux,state.fluxMean+state.fluxDeviation*2.4),oldMean=state.fluxMean;
 state.fluxMean=oldMean+(clippedFlux-oldMean)*.025;
 state.fluxDeviation+=(Math.abs(clippedFlux-oldMean)-state.fluxDeviation)*.025;
 state.micLevel=raw>state.micLevel?state.micLevel*.2+raw*.8:state.micLevel*.78+raw*.22;
 state.micPeak*=.88;meter.style.width=`${state.micLevel*100}%`;
 beatReadout.textContent=state.beatPeriod?`${Math.round(state.beatBpm)} BPM · ${state.beatConfidence>=.55?'BEAT LOCK':'SYNCING'}`:'BEAT SEARCH';
}
async function detectScreens(){const select=document.getElementById('monitorSelect');if(!window.getScreenDetails){status('Browser unterstützt keine Monitor-Erkennung. Ausgabe-Fenster öffnen und manuell auf den gewünschten Bildschirm ziehen.');return}try{const d=await window.getScreenDetails();state.screens=d.screens;select.replaceChildren();d.screens.forEach((s,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=s.label||`Bildschirm ${i+1}`;select.append(o)});status(`${d.screens.length} Bildschirm(e) erkannt.`)}catch(e){status('Monitorzugriff verweigert. Website-Berechtigung „Fensterverwaltung“ erlauben oder Ausgabe-Fenster manuell ziehen.')}}document.getElementById('detectMonitors').addEventListener('click',detectScreens);
function drawSelectionOverlay(ctx,c,t){const x=t.x*c.width,y=t.y*c.height,w=t.w*c.width,h=t.h*c.height;ctx.save();ctx.strokeStyle='#d1ff38';ctx.lineWidth=Math.max(2,c.width/640);ctx.setLineDash([9,6]);ctx.strokeRect(x,y,w,h);ctx.setLineDash([]);const s=Math.max(12,c.width*.014),points=[[x,y],[x+w/2,y],[x+w,y],[x+w,y+h/2],[x+w,y+h],[x+w/2,y+h],[x,y+h],[x,y+h/2]];ctx.fillStyle='#d1ff38';points.forEach(([px,py])=>{ctx.fillRect(px-s/2,py-s/2,s,s);ctx.strokeStyle='#151515';ctx.lineWidth=1.5;ctx.strokeRect(px-s/2,py-s/2,s,s)});ctx.restore()}
function point(e,c){const r=c.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height}}
function edgeAt(p,t,threshold=.035){const l=Math.abs(p.x-t.x)<=threshold,r=Math.abs(p.x-(t.x+t.w))<=threshold,top=Math.abs(p.y-t.y)<=threshold,bottom=Math.abs(p.y-(t.y+t.h))<=threshold;if(l&&top)return' nw';if(r&&top)return' ne';if(l&&bottom)return' sw';if(r&&bottom)return' se';if(top)return'n';if(bottom)return's';if(l)return'w';if(r)return'e';return''}
function attachDrag(c){const pointers=new Map();let pinch=null;c.style.touchAction='none';c.addEventListener('pointerdown',e=>{const p=point(e,c);pointers.set(e.pointerId,p);c.setPointerCapture(e.pointerId);if(pointers.size===2){const pts=[...pointers.values()],dx=pts[0].x-pts[1].x,dy=pts[0].y-pts[1].y,t=state.tracks.find(x=>x.id===state.selectedId&&x.visible);if(t){pinch={id:t.id,distance:Math.max(.01,Math.hypot(dx,dy)),w:t.w,h:t.h,cx:t.x+t.w/2,cy:t.y+t.h/2};state.drag=null;e.preventDefault()}return}const r=state.visualizerRect;if(c===outputCanvas&&state.visualizerStyle!=='off'&&p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h){state.drag={type:'viz',resize:p.x>r.x+r.w-.025&&p.y>r.y+r.h-.025,dx:p.x-r.x,dy:p.y-r.y};e.preventDefault();return}const t=[...state.tracks].reverse().find(x=>x.visible&&p.x>=x.x&&p.x<=x.x+x.w&&p.y>=x.y&&p.y<=x.y+x.h);if(t){state.selectedId=t.id;const edge=edgeAt(p,t);state.drag={type:'track',id:t.id,edge,dx:p.x-t.x,dy:p.y-t.y,startX:t.x,startY:t.y,startW:t.w,startH:t.h};render();e.preventDefault()}});c.addEventListener('pointermove',e=>{if(pointers.has(e.pointerId))pointers.set(e.pointerId,point(e,c));if(pinch&&pointers.size>=2){const pts=[...pointers.values()],distance=Math.max(.01,Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)),t=state.tracks.find(x=>x.id===pinch.id);if(t){const factor=distance/pinch.distance,nw=clamp(pinch.w*factor,.08,2),nh=clamp(pinch.h*factor,.08,2);t.w=nw;t.h=nh;t.x=clamp(pinch.cx-nw/2,-.5,1.5-nw);t.y=clamp(pinch.cy-nh/2,-.5,1.5-nh);}e.preventDefault();return}if(!state.drag)return;const p=point(e,c),d=state.drag;if(d.type==='viz'){const r=state.visualizerRect;if(d.resize){r.w=clamp(p.x-r.x,.12,1-r.x);r.h=clamp(p.y-r.y,.08,1-r.y)}else{r.x=clamp(p.x-d.dx,0,1-r.w);r.y=clamp(p.y-d.dy,0,1-r.h)}}else{const t=state.tracks.find(x=>x.id===d.id);if(!t)return;if(d.edge){const min=.08;if(d.edge.includes('w')){const right=d.startX+d.startW;t.x=clamp(p.x,0,right-min);t.w=right-t.x}if(d.edge.includes('e'))t.w=clamp(p.x-d.startX,min,2);if(d.edge.includes('n')){const bottom=d.startY+d.startH;t.y=clamp(p.y,0,bottom-min);t.h=bottom-t.y}if(d.edge.includes('s'))t.h=clamp(p.y-d.startY,min,2)}else{t.x=clamp(p.x-d.dx,-.5,1.5-t.w);t.y=clamp(p.y-d.dy,-.5,1.5-t.h)}}e.preventDefault()});const finish=e=>{pointers.delete(e.pointerId);if(pointers.size<2)pinch=null;state.drag=null};for(const ev of ['pointerup','pointercancel','lostpointercapture'])c.addEventListener(ev,finish)}
attachDrag(outputCanvas);attachDrag(previewCanvas);function openOutput(){const win=window.open('','vjstudio-output','popup,width=1280,height=760');if(!win){status('Popup blockiert. Popups für diese Seite erlauben.',true);return}state.outputWindow=win;win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>VJ Studio Output</title><style>*{box-sizing:border-box}body{margin:0;background:#090a0d;color:#aaa;font:11px system-ui}header{height:30px;padding:7px 12px;background:#191a1e}canvas{width:100vw;height:calc(100vh - 30px);display:block;touch-action:none}</style></head><body><header>VJ STUDIO · PROGRAM OUTPUT</header><canvas id="out" width="1280" height="720"></canvas></body></html>');win.document.close();const s=state.screens[Number(document.getElementById('monitorSelect').value)];if(s)try{win.moveTo(s.availLeft,s.availTop);win.resizeTo(s.availWidth,s.availHeight)}catch(e){}attachDrag(win.document.getElementById('out'))}document.getElementById('openOutput').addEventListener('click',openOutput);document.getElementById('fullscreenOutput').addEventListener('click',()=>{const w=state.outputWindow&&!state.outputWindow.closed?state.outputWindow:window;w.document.documentElement.requestFullscreen?.().catch(()=>{})});
const fxDeck=document.querySelector('.effect-deck');document.getElementById('effectsPopupContent').append(fxDeck);const strobeControls=[...document.querySelectorAll('#strobeIntensity,#strobeRate')].map(el=>el.closest('.effect-control'));document.querySelector('.audio-deck .effect-controls').prepend(...strobeControls);document.getElementById('openEffects').addEventListener('click',()=>document.getElementById('effectsDialog').showModal());document.getElementById('closeEffects').addEventListener('click',()=>document.getElementById('effectsDialog').close());document.getElementById('previewFullscreen').addEventListener('click',()=>document.querySelector('.preview-monitor').requestFullscreen?.().catch(()=>{}));document.getElementById('programFullscreen').addEventListener('click',()=>document.querySelector('.program').requestFullscreen?.().catch(()=>{}));function animate(time){audio();browserEngine?.renderGenerators(time);browserEngine?.updatePlayback(time);scene(previewCtx,previewCanvas,time,true);scene(outputCtx,outputCanvas,time);if(state.outputWindow&&!state.outputWindow.closed){const c=state.outputWindow.document.getElementById('out');if(c)c.getContext('2d').drawImage(outputCanvas,0,0,c.width,c.height)}else if(state.outputWindow?.closed)state.outputWindow=null;document.getElementById('previewLabel').textContent=state.tracks.find(t=>t.id===state.selectedId)?.name||'Clip auswählen';document.getElementById('outputLabel').textContent=`${new Set(state.tracks.filter(t=>t.visible&&(state.activeColumns[t.layerId||t.id]??0)===Number(t.column||0)).map(t=>t.layerId||t.id)).size} aktive Layer`;requestAnimationFrame(animate)}document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;if(/^[1-9]$/.test(e.key)){launchGridColumn(Number(e.key)-1);return}if(e.code!=='Space')return;e.preventDefault();const t=state.tracks.find(x=>x.id===state.selectedId);if(t){if(t.video.paused)t.video.play?.().catch?.(()=>{});else t.video.pause?.()}});function projectSnapshot(){return{version:1,gridColumns:state.gridColumns,activeColumns:state.activeColumns,controls:{renderQuality:document.getElementById('renderQuality')?.value||'720',strobeIntensity:strobe.value,strobeRate:rate.value,visualizerGain:gain.value,visualizerStyle:visual.value,crossfader:cross.value,chromaEnabled:chroma.checked,chromaColor:chromaColor.value,chromaTolerance:tolerance.value,filterPreset:document.getElementById('filterPreset').value,micSensitivity:document.getElementById('micSensitivity').value},tracks:[...state.tracks.filter(t=>t.type!=='camera').map(t=>({fileName:t.fileName||t.name,layerId:t.layerId||t.id,column:Number(t.column||0),deck:t.deck,x:t.x,y:t.y,w:t.w,h:t.h,opacity:t.opacity,volume:t.volume,visible:t.visible,strobe:t.strobe,type:t.type||'video',generatorKind:t.generatorKind||null,blendMode:t.blendMode||'normal',syncBeats:t.syncBeats||0,playMode:t.playMode||'loop',autopilot:t.autopilot||'off',filterPreset:t.filterPreset||'',solo:!!t.solo,audioReactive:!!t.audioReactive})),...(savedProject?.tracks||[]).filter(old=>!state.tracks.some(t=>(t.fileName||t.name)===old.fileName))]};}
let lastProjectJSON='';
function saveProject(){try{const json=JSON.stringify(projectSnapshot());if(json!==lastProjectJSON){localStorage.setItem(PROJECT_KEY,json);lastProjectJSON=json;savedProject=JSON.parse(json);}}catch(e){status('Automatisches Speichern nicht verfügbar (Browser-Speicher blockiert).',true)}}
function downloadProject(){saveProject();const blob=new Blob([JSON.stringify(projectSnapshot(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='vj-studio-project.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
document.getElementById('exportProject').addEventListener('click',downloadProject);
document.getElementById('importProjectInput').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const data=JSON.parse(await file.text());if(data.version!==1||!data.controls||!Array.isArray(data.tracks))throw new Error('Ungültiges Projektformat');localStorage.setItem(PROJECT_KEY,JSON.stringify(data));location.reload();}catch(err){status('Projektdatei ungültig: '+err.message,true)}e.target.value=''});
document.addEventListener('input',e=>{if(e.target.closest('#effectsDialog')||e.target.closest('.track')||e.target.id==='crossfader')setTimeout(saveProject,0);},true);
document.addEventListener('change',e=>{if(e.target.closest('#effectsDialog')||e.target.closest('.track')||e.target.id==='filterPreset'||e.target.classList.contains('deck-select'))setTimeout(saveProject,0);},true);
tracksElement.addEventListener('click',()=>setTimeout(saveProject,0));
for(const canvas of [outputCanvas,previewCanvas])canvas.addEventListener('pointerup',()=>setTimeout(saveProject,0));
if(savedProject?.controls){for(const [id,value] of Object.entries(savedProject.controls)){const el=document.getElementById(id);if(el){if(el.type==='checkbox')el.checked=!!value;else el.value=String(value)}}}
controls();const quality=document.getElementById('renderQuality');if(!savedProject?.controls?.renderQuality&&(navigator.hardwareConcurrency<=4||matchMedia('(max-width: 820px)').matches))quality.value='540';function applyRenderQuality(){const h=Number(quality.value)||720,w=Math.round(h*16/9);for(const c of [previewCanvas,outputCanvas]){if(c.width!==w||c.height!==h){c.width=w;c.height=h;}}status(`Render-Auflösung: ${w}×${h}`)}quality?.addEventListener('change',()=>{applyRenderQuality();saveProject()});applyRenderQuality();render();if(savedProject?.tracks?.length){const msg='Projekt geladen: '+savedProject.tracks.length+' Clip(s) vorgemerkt. Bitte Videos erneut auswählen – Videodateien werden nicht gespeichert.';status(msg);document.getElementById('importStatus').title='Die Projektdaten sind lokal gespeichert; Videodateien müssen nach einem Neuladen erneut ausgewählt werden.';}requestAnimationFrame(animate);
