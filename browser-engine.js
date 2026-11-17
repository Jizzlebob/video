const VIDEO_EXT=/\.(mp4|m4v|webm|mov|ogv|ogg|mkv|avi)$/i;
const IMAGE_EXT=/\.(png|jpe?g|webp|gif|bmp)$/i;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const uid=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`;
const BEATS=[.25,.5,1,2,4,8,16,32];
const OPS={normal:'source-over',add:'lighter',screen:'screen',multiply:'multiply',overlay:'overlay',difference:'difference',lighten:'lighten',darken:'darken',subtract:'difference'};
function createImageMedia(file,url){const img=new Image();img.src=url;img.decoding='async';img.loading='eager';img.setAttribute('fetchpriority','high');Object.defineProperties(img,{videoWidth:{get:()=>img.naturalWidth},videoHeight:{get:()=>img.naturalHeight},readyState:{get:()=>img.complete&&img.naturalWidth?4:0},paused:{get:()=>false}});img.volume=.8;img.play=()=>Promise.resolve();img.pause=()=>{};return img}
function createGenerator(kind){
 const c=document.createElement('canvas');c.width=640;c.height=360;
 Object.defineProperties(c,{videoWidth:{get:()=>c.width},videoHeight:{get:()=>c.height},readyState:{get:()=>4},paused:{get:()=>false}});
 c.volume=.8;c.play=()=>Promise.resolve();c.pause=()=>{};c.currentTime=0;
 return c;
}
function renderGenerator(t,time,bpm){
 const c=t.video,x=c.getContext('2d'),w=c.width,h=c.height,beat=bpm>0?time/60000*bpm:time/1000;
 c.currentTime=time/1000;x.save();x.globalCompositeOperation='source-over';x.clearRect(0,0,w,h);
 const baseHue={rainbow:0,fire:12,ocean:195,neon:285,forest:115}[t.generatorPalette||'rainbow']??0,hue=(baseHue+time*.025)%360,phase=beat*Math.PI*2;
 const grad=(a,b)=>{const g=x.createLinearGradient(0,0,w,h);g.addColorStop(0,a);g.addColorStop(1,b);return g};
 switch(t.generatorKind){
 case'plasma':{const g=x.createRadialGradient(w*(.5+.22*Math.sin(time*.00031)),h*(.5+.3*Math.cos(time*.00027)),4,w*.5,h*.5,w*.8);g.addColorStop(0,`hsl(${hue} 95% 70%)`);g.addColorStop(.45,`hsl(${hue+95} 90% 38%)`);g.addColorStop(1,'#080817');x.fillStyle=g;x.fillRect(0,0,w,h);for(let i=0;i<6;i++){x.beginPath();x.arc(w/2+Math.sin(time*.0002+i)*w*.24,h/2+Math.cos(time*.00023+i*2)*h*.25,25+i*13,0,Math.PI*2);x.strokeStyle=`hsla(${hue+i*47} 100% 75% / .45)`;x.lineWidth=3;x.stroke()}break}
 case'tunnel':{x.fillStyle='#080812';x.fillRect(0,0,w,h);for(let i=18;i>0;i--){const r=(i/18)*Math.min(w,h)*.72*(.72+.28*Math.sin(phase*.25));x.beginPath();x.ellipse(w/2,h/2,r*1.5,r,phase*.08,0,Math.PI*2);x.strokeStyle=`hsl(${hue+i*13} 95% 60% / .8)`;x.lineWidth=5;x.stroke()}break}
 case'bars':{x.fillStyle='#070912';x.fillRect(0,0,w,h);for(let i=0;i<26;i++){const bw=w/26*.72,bh=h*(.18+.72*(.5+.5*Math.sin(phase+i*.7)));x.fillStyle=`hsl(${hue+i*9} 95% 58%)`;x.fillRect(i*w/26,(h-bh)/2,bw,bh)}break}
 case'rings':{x.fillStyle='#090812';x.fillRect(0,0,w,h);for(let i=0;i<17;i++){const r=14+i*18+Math.sin(phase-i*.4)*8;x.beginPath();x.arc(w/2,h/2,r,0,Math.PI*2);x.strokeStyle=`hsla(${hue+i*18} 100% 65% / .9)`;x.lineWidth=4+(i%3);x.stroke()}break}
 case'noise':{x.fillStyle=grad('#080916','#27104a');x.fillRect(0,0,w,h);for(let i=0;i<190;i++){const xx=(Math.sin(i*127.1+time*.00015)*.5+.5)*w,yy=(Math.sin(i*311.7-time*.00012)*.5+.5)*h,r=2+(i%7)*1.6;x.fillStyle=`hsla(${hue+i*2} 100% 65% / .45)`;x.fillRect(xx,yy,r,r)}break}
 case'kaleido':{x.fillStyle='#070810';x.fillRect(0,0,w,h);x.save();x.translate(w/2,h/2);for(let i=0;i<12;i++){x.rotate(Math.PI/6);x.rotate(time*.0001);const g=x.createLinearGradient(0,0,w*.45,h*.3);g.addColorStop(0,`hsl(${hue+i*20} 95% 65%)`);g.addColorStop(1,'#140c32');x.fillStyle=g;x.beginPath();x.moveTo(0,0);x.lineTo(w*.48,-h*.2);x.lineTo(w*.38,h*.24);x.closePath();x.fill()}x.restore();break}
 case'gradient':{x.fillStyle=grad(`hsl(${hue} 90% 55%)`,`hsl(${hue+150} 90% 30%)`);x.fillRect(0,0,w,h);const g=x.createRadialGradient(w*(.5+.35*Math.sin(time*.0002)),h*(.5+.35*Math.cos(time*.00017)),4,w/2,h/2,h*.9);g.addColorStop(0,'#ffffff55');g.addColorStop(1,'#00000000');x.fillStyle=g;x.fillRect(0,0,w,h);break}
 case'strobe':{x.fillStyle=(Math.floor(beat)%2)?'#f4f4ff':'#100d2c';x.fillRect(0,0,w,h);x.fillStyle=`hsl(${hue} 95% 65%)`;x.fillRect(w*.2,h*.2,w*.6,h*.6);break}
 case'checker':{x.fillStyle='#090a13';x.fillRect(0,0,w,h);x.save();x.translate(w/2,h/2);x.rotate(time*.00012);const size=34;for(let yy=-h;yy<h;yy+=size)for(let xx=-w;xx<w;xx+=size){if((Math.floor(xx/size)+Math.floor(yy/size))%2===0){x.fillStyle=`hsl(${hue+Math.abs(xx/w)*100} 90% 60%)`;x.fillRect(xx,yy,size,size)}}x.restore();break}
 }
 x.restore();
}
export function initBrowserEngine({state,render,status,saveProject,savedProject}){
 const input=document.getElementById('videoInput'),paletteSelect=document.getElementById('generatorPalette'),cameraButton=document.getElementById('addCamera'),generatorButton=document.getElementById('addGenerator'),generatorSelect=document.getElementById('generatorKind'),tapButton=document.getElementById('tapTempo'),midiButton=document.getElementById('midiToggle'),midiStatus=document.getElementById('midiStatus');
 const midi={access:null,active:false};
 let taps=[],manualBpm=0,lastBeatRate=0;
 function deck(){return 'A'}
 function restored(name){return savedProject?.tracks?.find(t=>t.fileName===name)||null}
 function addTrack(t){state.tracks.push(t);state.selectedId=t.id;render();saveProject();return t}
 function base(name,type,video,url='',fileName=name){const old=restored(fileName);return Object.assign({id:uid(),layerId:old?.layerId||uid(),column:old?.column??0,name,fileName,type,video,url,volume:.8,opacity:1,visible:true,strobe:true,deck:deck(),x:.1,y:.1,w:.8,h:.8,error:'',blendMode:'normal',syncBeats:0},old?{deck:old.deck||deck(),x:old.x??.1,y:old.y??.1,w:old.w??.8,h:old.h??.8,opacity:old.opacity??1,volume:old.volume??.8,visible:old.visible??true,strobe:old.strobe??true,blendMode:old.blendMode||'normal',syncBeats:old.syncBeats||0,playMode:old.playMode||'loop',autopilot:old.autopilot||'off',filterPreset:old.filterPreset||'',solo:!!old.solo,audioReactive:!!old.audioReactive,locked:!!old.locked}:{locked:false})}
 function addFiles(files){
  let count=0;
  for(const file of files){
   if(file.type.startsWith('video/')||VIDEO_EXT.test(file.name)){
    const url=URL.createObjectURL(file),video=document.createElement('video');video.src=url;video.loop=true;video.muted=true;video.playsInline=true;video.preload='auto';video.setAttribute('playsinline','');
    const t=base(file.name.replace(/\.[^/.]+$/,''),'video',video,url,file.name);
    video.addEventListener('loadedmetadata',()=>{video.loop=t.playMode==='loop';status(`Video bereit: ${file.name} · ${video.videoWidth}×${video.videoHeight}`);if(!restored(file.name))video.play().catch(()=>status('Clip bereit. Wiedergabe über PLAY starten.'));else status(`Projektclip bereit: ${file.name}. PLAY drücken.`);});video.addEventListener('ended',()=>{if(t.playMode==='once-clear'){t.visible=false;render()}else if(t.playMode==='once-hold'){video.currentTime=Math.max(0,video.duration-.05);video.pause()}if(t.autopilot!=='off'){const peers=state.tracks.filter(x=>x.deck===t.deck&&x.type==='video');if(peers.length>1){const index=peers.indexOf(t);let next;if(t.autopilot==='random'){const choices=peers.filter(x=>x!==t);next=choices[Math.floor(Math.random()*choices.length)]}else{const step=t.autopilot==='previous'?-1:1;next=peers[(index+step+peers.length)%peers.length]}next.visible=true;next.video.play().catch(()=>{});render()}}});
    video.addEventListener('error',()=>{t.error=video.error?.code===4?'Codec nicht unterstützt':'Ladefehler';status(`${file.name}: ${t.error}. MP4/H.264 oder WebM testen.`,true);render()});video.load();addTrack(t);count++;
   }else if(file.type.startsWith('image/')||IMAGE_EXT.test(file.name)){
    const url=URL.createObjectURL(file),img=createImageMedia(file,url),t=base(file.name.replace(/\.[^/.]+$/,''),'image',img,url,file.name);
    img.onload=()=>{status(`Bild bereit: ${file.name} · ${img.naturalWidth}×${img.naturalHeight}`);render()};img.onerror=()=>{t.error='Bild konnte nicht geladen werden';status(t.error,true);render()};addTrack(t);count++;
   }
  }
  if(count)status(`${count} Quelle(n) hinzugefügt.`);else status('Keine unterstützten Medien gefunden. Video oder Bild wählen.',true);
 }
 input.addEventListener('change',e=>{addFiles(Array.from(e.target.files||[]));e.target.value=''});
 function addGenerator(kind,old=null){const canvas=createGenerator(kind),t=base(kind.toUpperCase(),'generator',canvas,'',kind.toUpperCase());t.generatorKind=kind;t.generatorPalette=old?.generatorPalette||paletteSelect?.value||'rainbow';t.name={plasma:'Plasma',tunnel:'Tunnel',bars:'Beat Bars',rings:'Rings',noise:'Noise',kaleido:'Kaleidoscope',gradient:'Gradient',strobe:'Strobe',checker:'Checker'}[kind]||kind;if(old)Object.assign(t,{generatorPalette:old.generatorPalette||t.generatorPalette,deck:old.deck||t.deck,x:old.x??t.x,y:old.y??t.y,w:old.w??t.w,h:old.h??t.h,opacity:old.opacity??t.opacity,visible:old.visible??true,strobe:old.strobe??true,blendMode:old.blendMode||'normal',syncBeats:old.syncBeats||0});addTrack(t);if(!old)status(`Generator hinzugefügt: ${t.name}`)}
 generatorButton.addEventListener('click',()=>addGenerator(generatorSelect.value));paletteSelect?.addEventListener('change',()=>{const t=state.tracks.find(x=>x.id===state.selectedId&&x.type==='generator');if(t){t.generatorPalette=paletteSelect.value;saveProject();}});
 async function addCamera(){if(!navigator.mediaDevices?.getUserMedia){status('Kamera benötigt HTTPS und getUserMedia.',true);return}try{const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30,max:30}},audio:false}),video=document.createElement('video');video.srcObject=stream;video.muted=true;video.playsInline=true;video.autoplay=true;video.setAttribute('playsinline','');await video.play();const t=base('Live Camera','camera',video);t.stream=stream;addTrack(t);status('Live-Kamera aktiv.')}catch(e){status('Kamera nicht verfügbar oder Berechtigung verweigert: '+e.message,true)}}
 cameraButton.addEventListener('click',addCamera);
 for(const old of savedProject?.tracks||[])if(old.type==='generator'&&old.generatorKind)addGenerator(old.generatorKind,old);
 function renderGenerators(time){for(const t of state.tracks)if(t.type==='generator'&&t.visible)renderGenerator(t,time,state.beatBpm||manualBpm)}
 function updatePlayback(time){const bpm=state.beatBpm||manualBpm;if(!bpm)return;for(const t of state.tracks){if(!t.video||t.type==='image'||t.type==='generator'||t.type==='camera')continue;if(!t.syncBeats){if(t._syncRate){t.video.playbackRate=1;t._syncRate=false;}continue;}const d=t.video.duration;if(!Number.isFinite(d)||d<=0)continue;const rate=d/(t.syncBeats*60/bpm);const target=clamp(rate,.25,4);if(Math.abs(t.video.playbackRate-target)>.03)t.video.playbackRate=target;t._syncRate=true}}
 tapButton.addEventListener('click',()=>{const now=performance.now()/1000;if(taps.length&&now-taps[taps.length-1]>2)taps=[];taps.push(now);if(taps.length>8)taps.shift();if(taps.length>=2){manualBpm=clamp(60/((taps[taps.length-1]-taps[0])/(taps.length-1)),30,240);document.getElementById('beatReadout').textContent=`${Math.round(manualBpm)} BPM · TAP TEMPO`;status(`Tap Tempo: ${Math.round(manualBpm)} BPM`)}});
 midiButton.addEventListener('click',async()=>{if(!navigator.requestMIDIAccess){midiStatus.textContent='MIDI N/A';status('Web MIDI wird von diesem Browser nicht unterstützt.',true);return}try{midi.access=await navigator.requestMIDIAccess({sysex:false});midi.active=true;for(const input of midi.access.inputs.values())input.onmidimessage=onMidi;midi.access.onstatechange=()=>{for(const input of midi.access.inputs.values())input.onmidimessage=onMidi};midiStatus.textContent=`${midi.access.inputs.size} MIDI IN`;status('Web MIDI verbunden. Note-on startet den ausgewählten Clip; Note-off pausiert ihn.')}catch(e){midiStatus.textContent='MIDI BLOCKED';status('MIDI-Zugriff verweigert: '+e.message,true)}});
 function onMidi(e){const [statusByte,note,velocity]=e.data,command=statusByte&0xf0,t=state.tracks.find(x=>x.id===state.selectedId);if(!t)return;if(command===0x90&&velocity>0){t.video.play?.().catch?.(()=>{});if(t.video.volume!==undefined)t.video.volume=Math.max(.1,velocity/127)}else if(command===0x80||(command===0x90&&velocity===0))t.video.pause?.()}
 return{addFiles,addGenerator,renderGenerators,updatePlayback,get manualBpm(){return manualBpm},get blendOps(){return OPS}};
}
