import {dispatchText,sanitizeState,spokenFeedback,parseSpokenNumber} from './subscription-lesson.js';
export function privateServiceURL(value){
 const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('비공개 서비스의 HTTPS 주소만 입력해 주세요. 인증 정보·쿼리·#은 넣지 마세요.');return url.href;
}
export async function apiRequest(name,data={},options={}){
 if(!['catalog','start','stop','heartbeat','events','context'].includes(name))throw Error('Unknown endpoint');
 const r=await fetch('/api/'+name,{method:'POST',headers:{'Content-Type':'application/json','X-Voice-Request':'1'},credentials:'same-origin',redirect:'error',cache:'no-store',body:JSON.stringify(data),...options});
 const value=await r.json();if(!r.ok)throw Object.assign(Error(value.error||'비공개 Codex 서비스 연결을 확인해 주세요.'),{status:r.status});return value;
}
export class SubscriptionTeacher{
 constructor({audio,lesson,onState=()=>{},onText=()=>{},onLesson=()=>{},onError=()=>{},request=apiRequest,getUserMedia=opts=>navigator.mediaDevices.getUserMedia(opts),Peer=globalThis.RTCPeerConnection}){
  Object.assign(this,{audio,lesson,onState,onText,onLesson,onError,request,getUserMedia,Peer});this.generation=0;this.mutationSerial=0;this.active=false;this.connecting=false;this.paused=false;this.cursor=0;this.text={};this.controllers=new Set();this.playbackBlocked=false;
 }
 async call(name,data={},keepalive=false){
  const controller=new AbortController();this.controllers.add(controller);const timer=setTimeout(()=>controller.abort(),name==='start'?55000:15000);
  try{return await this.request(name,data,{signal:controller.signal,keepalive});}finally{clearTimeout(timer);this.controllers.delete(controller);}
 }
 async catalog(){return this.call('catalog');}
 async start({consent,voice}){
  if(this.stopping)await this.stopping;
  if(this.active||this.connecting)return;if(!consent)throw Error('성인 본인 테스트와 음성 전송에 동의해 주세요.');
  const gen=++this.generation;this.connecting=true;this.cursor=0;this.text={};this.onState('connecting');let permissionTimer;
  try{
   const c=await this.catalog();if(gen!==this.generation)return;
   if(c.accountType!=='chatgpt'||!c.voices.includes(voice))throw Error('Codex ChatGPT 로그인과 목소리를 확인해 주세요.');
   const acquire=this.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
   acquire.then(s=>{if(gen!==this.generation)s.getTracks().forEach(t=>t.stop());},()=>{});
   const stream=await Promise.race([acquire,new Promise((_,reject)=>{permissionTimer=setTimeout(()=>reject(Error('마이크 권한 대기 시간이 지났어요.')),20000);})]);clearTimeout(permissionTimer);
   if(gen!==this.generation)return;this.stream=stream;
   stream.getAudioTracks().forEach(t=>t.addEventListener?.('ended',()=>{if(gen===this.generation)void this.stop('마이크가 연결 해제됐어요.');}));
   const pc=new this.Peer();this.pc=pc;this.dc=pc.createDataChannel('oai-events');stream.getAudioTracks().forEach(t=>pc.addTrack(t,stream));
   pc.ontrack=e=>{if(gen!==this.generation)return;this.audio.srcObject=e.streams?.[0]||new MediaStream([e.track]);void this.unlockAudio(gen).catch(()=>{});};
   pc.onconnectionstatechange=()=>{if(gen===this.generation&&['failed','closed','disconnected'].includes(pc.connectionState))void this.stop('음성 연결이 끊겼어요.');};
   await pc.setLocalDescription(await pc.createOffer());if(gen!==this.generation)return;
   if(pc.iceGatheringState!=='complete')await new Promise(resolve=>{const finish=()=>{clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',changed);resolve();};const changed=()=>{if(pc.iceGatheringState==='complete')finish();};const timer=setTimeout(finish,3000);pc.addEventListener('icegatheringstatechange',changed);});
   if(gen!==this.generation)return;
   this.sessionId=Array.from(crypto.getRandomValues(new Uint8Array(24)),n=>n.toString(16).padStart(2,'0')).join('');
   this.beat=setInterval(()=>{void this.call('heartbeat',{sessionId:this.sessionId}).catch(()=>gen===this.generation&&this.stop('서버 연결이 끊겼어요.'));},5000);
   const answer=await this.call('start',{sessionId:this.sessionId,consent:true,voice,sdp:pc.localDescription.sdp,state:sanitizeState(this.lesson.state())});
   if(gen!==this.generation)return;await pc.setRemoteDescription({type:'answer',sdp:answer.sdp});if(gen!==this.generation)return;
   this.active=true;this.connecting=false;this.started=Date.now();this.lastTurn=Date.now();this.onState('listening');void this.poll(gen);
   this.limit=setInterval(()=>{if(Date.now()-this.started>=600000||Date.now()-this.lastTurn>=120000)void this.stop('수업 시간 또는 무대화 제한으로 종료했어요.');},1000);
  }catch(e){if(gen===this.generation){await this.stop();this.onError(e.message);throw e;}}finally{clearTimeout(permissionTimer);}
 }
 async poll(gen){
  try{while(this.active&&gen===this.generation){const at=Date.now();const r=await this.call('events',{sessionId:this.sessionId,after:this.cursor});for(const event of r.events){if(gen!==this.generation)return;await this.receive(event);}if(!this.active||gen!==this.generation)return;const gap=300-(Date.now()-at);if(gap>0)await new Promise(r=>setTimeout(r,gap));}}
  catch{if(gen===this.generation)await this.stop('서버 이벤트 연결이 끊겼어요.');}
 }
 async receive(event){
  if(!this.active||event.id<=this.cursor)return;this.cursor=event.id;const {type,data}=event;
  if(!['user','assistant'].includes(data?.role))return;const role=data.role;
  if(type==='thread/realtime/transcript/delta'){this.text[role]=((this.text[role]||'')+(data.delta||'')).slice(0,1500);this.onText(role==='assistant'?'teacher':'user',this.text[role]);if(role==='assistant'&&!this.paused)this.onState('speaking');if(role==='user')this.settleNumeric();return;}
  if(type!=='thread/realtime/transcript/done')return;this.text[role]='';this.onText(role==='assistant'?'teacher':'user',String(data.text||'').slice(0,1500));
  if(role==='user'){
   clearTimeout(this.numericTimer);
   const provisional=this.provisional;this.provisional=null;
   if(provisional&&parseSpokenNumber(data.text)===provisional.value)return;
   if(provisional&&!this.paused&&(parseSpokenNumber(data.text)!==null||String(data.text).trim().startsWith(provisional.text))){await this.dispatch(data.text,provisional);return;}
  }
  if(role==='user'&&!this.paused){this.lastTurn=Date.now();await this.dispatch(data.text);}else if(!this.paused)this.onState('listening');
 }
 // V3 may stream a whole short answer without completing its transcript part.
 // A bounded, unchanged *whole numeric* candidate is provisional, never a delta token.
 settleNumeric(){
  clearTimeout(this.numericTimer);const text=this.text.user,value=parseSpokenNumber(text),gen=this.generation;
  if(value===null||this.provisional||this.paused)return;
  this.numericTimer=setTimeout(()=>{
   if(!this.active||this.paused||gen!==this.generation||this.text.user!==text)return;
   if(this.dispatchQueue?.running||this.dispatchQueue?.items.length){this.settleNumeric();return;}
   this.provisional={value,text,afterRevision:this.mutationSerial+1,problemId:this.lesson.id,snapshot:Object.fromEntries(Object.entries(this.lesson).map(([key,value])=>[key,typeof value==='function'?value:structuredClone(value)]))};void this.dispatch(text);
  },1200);
 }
 dispatch(text,restore=null){
  if(!this.active||this.paused)return Promise.resolve(false);
  const queue=this.dispatchQueue??=( {generation:this.generation,items:[],running:null} );
  // Bound all outstanding inputs, including the context request in flight.
  if(queue.items.length+(queue.running?1:0)>=8){this.onError('입력이 밀려 있어요. 잠시 후 다시 말해 주세요.');return Promise.resolve(false);}
  return new Promise(resolve=>{queue.items.push({text:String(text??'').slice(0,1500),restore,resolve});if(!queue.running)void this.drainDispatch(queue);});
 }
 async drainDispatch(queue){
  const current=()=>this.active&&queue.generation===this.generation&&this.dispatchQueue===queue;
  while(current()&&queue.items.length){
   const item=queue.items.shift();queue.running=item;let snapshot;
   try{
    if(this.paused){item.resolve(false);continue;}
    if(item.restore&&(item.restore.problemId!==this.lesson.id||item.restore.afterRevision!==this.mutationSerial)){item.resolve(false);continue;}
    if(item.restore?.snapshot)Object.assign(this.lesson,item.restore.snapshot);
    // Preserve nested progress and correction history as well as the visible board.
    snapshot=Object.fromEntries(Object.entries(this.lesson).map(([key,value])=>[key,typeof value==='function'?value:structuredClone(value)]));
    this.lastTurn=Date.now();const result=dispatchText(this.lesson,item.text);if(result.ok)this.mutationSerial++;this.onLesson(result);
    if(!current()){item.resolve(false);return;}
    if(result.end){await this.stop('오늘 수업은 여기까지!');item.resolve(false);return;}
    if(result.error!=='PRIVATE_INPUT')await this.call('context',{sessionId:this.sessionId,state:sanitizeState(result.state),text:item.text,feedback:spokenFeedback(result)||result.feedback||result.suggested_coaching||result.error||result.result||''});
    item.resolve(current());
   }catch(e){
    if(current()){
     if(e.status===429&&snapshot){
      Object.assign(this.lesson,snapshot);
      const stopping=this.stop("수업 상태 전송에 실패했어요. 다시 연결해 주세요.");
      this.onLesson({ok:false,error:'CONTEXT_REJECTED',state:this.lesson.state()});
      await stopping;
     }else await this.stop("수업 상태 전송에 실패했어요.");
    }
    item.resolve(false);
   }finally{queue.running=null;}
  }
 }
 async say(text){return this.dispatch(text);}
 pause(value){if(!this.active)return;this.paused=!!value;this.stream.getAudioTracks().forEach(t=>t.enabled=!this.paused);this.audio.muted=this.paused;this.onState(this.paused?'paused':'listening');}
 async unlockAudio(gen=this.generation){
  try{await this.audio.play();if(gen!==this.generation)return;this.playbackBlocked=false;this.onState(this.paused?'paused':'listening');}
  catch(e){if(gen===this.generation){this.playbackBlocked=true;this.onState('audio-blocked');}throw e;}
 }
 stop(message='',unload=false){
  if(this.stopping)return this.stopping;
  let resolve,reject;const cleanup=new Promise((done,fail)=>{resolve=done;reject=fail;});this.stopping=cleanup;
  const clear=()=>{if(this.stopping===cleanup)this.stopping=null;};
  void cleanup.then(clear,clear);void this.finishStop(message,unload).then(resolve,reject);return cleanup;
 }
 async finishStop(message='',unload=false){
  clearTimeout(this.numericTimer);this.provisional=null;
  const sessionId=this.sessionId;this.sessionId=null;this.generation++;this.playbackBlocked=false;this.active=false;this.connecting=false;this.paused=false;clearInterval(this.beat);clearInterval(this.limit);
  // Detach before aborting: old requests may settle after a new lesson starts.
  const queue=this.dispatchQueue;this.dispatchQueue=null;
  if(queue){queue.running?.resolve(false);for(const item of queue.items)item.resolve(false);queue.items.length=0;}
  for(const c of this.controllers)c.abort();this.controllers.clear();this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.pc?.getReceivers?.().forEach(r=>r.track?.stop());this.pc?.close();this.pc=null;this.dc?.close();this.dc=null;this.audio.pause();this.audio.srcObject=null;this.audio.muted=false;this.text={};this.onState('stopped',message);
  if(sessionId)try{await this.call('stop',{sessionId},unload);}catch{if(!unload)this.onError('서버 종료 응답을 확인하지 못했어요. heartbeat 만료로 자동 정리됩니다.');}
 }
}
