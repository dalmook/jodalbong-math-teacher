/* Browser-only BYOK test transport. No key or conversation persistence. */
const BASE='https://api.openai.com/v1';
export function errorMessage(e){
  if(e?.name==='NotAllowedError')return '마이크 권한을 허용해 주세요. 주소창의 사이트 설정에서 바꿀 수 있어요.';
  if(e?.name==='NotFoundError')return '마이크를 찾지 못했어요. 휴대폰 Chrome/Safari에서 다시 열어 주세요.';
  if(e?.status===401)return 'API 키가 올바르지 않거나 만료됐어요. 키를 다시 입력해 주세요.';
  if(e?.status===403)return '이 API 키의 모델 사용 권한을 확인해 주세요.';
  if(e?.status===429)return 'API 잔액 또는 사용량 제한을 확인해 주세요. ChatGPT 구독과 API 결제는 별도예요.';
  if(e?.status===404)return '선택한 모델을 이 계정에서 사용할 수 없어요. 설정에서 기존 Realtime Mini로 바꿔 테스트해 주세요.';
  if(e?.status===400)return '음성 연결 설정이 거절됐어요. 설정에서 기존 Realtime Mini로 바꾸거나 아래 오류 코드를 확인해 주세요.';
  if(e?.status>=500)return 'OpenAI 서비스가 일시적으로 응답하지 않아요. 다시 시작해 주세요.';
  if(e?.name==='AbortError'||e?.message==='timeout')return '연결 시간이 길어져 중단했어요. 마이크 권한과 네트워크를 확인해 주세요.';
  return '실시간 연결을 시작하지 못했어요. HTTPS 주소를 Chrome/Safari에서 열고 네트워크를 확인해 주세요.';
}
export class RealtimeTeacher {
  constructor({audio,onState=()=>{},onText=()=>{},onError=()=>{},onUsage=()=>{},onTool=()=>({ok:false})}){
    this.audio=audio;this.onState=onState;this.onText=onText;this.onError=onError;this.onUsage=onUsage;this.onTool=onTool;
    this.generation=0;this.controllers=new Set();this.calls=new Map();this.active=false;this.connecting=false;this.paused=false;this.responding=false;this.toolRounds=0;this.totalResponses=0;this.text='';this.userSpeaking=false;
  }
  send(event){if(this.dc?.readyState==='open'){this.dc.send(JSON.stringify(event));return true;}return false;}
  async request(path,body,token,sdp=false){
    if(!['/realtime/client_secrets','/realtime/calls'].includes(path))throw new Error('invalid-endpoint');
    const c=new AbortController();this.controllers.add(c);const timer=setTimeout(()=>c.abort(),25000);
    try{
      const r=await fetch(BASE+path,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':sdp?'application/sdp':'application/json'},body:sdp?body:JSON.stringify(body),signal:c.signal,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',redirect:'error'});
      if(!r.ok){let data={};try{data=await r.json();}catch{}const err=new Error('api-error');err.status=r.status;err.code=/^[a-z0-9_.-]{1,70}$/i.test(data.error?.code??'')?data.error.code:'';throw err;}
      return sdp?await r.text():await r.json();
    }finally{clearTimeout(timer);this.controllers.delete(c);}
  }
  async start(key,config,initialState=null){
    if(this.active||this.connecting)return;
    if(!/^sk-[A-Za-z0-9_-]{16,}$/.test(key))throw new Error('invalid-key');
    this.stop('');const gen=++this.generation;this.connecting=true;this.config=config;this.onState('connecting');
    let timer,permissionTimer;
    try{
      if(!globalThis.isSecureContext||!navigator.mediaDevices?.getUserMedia||!globalThis.RTCPeerConnection)throw new Error('unsupported-browser');
      const acquire=navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
      acquire.then(s=>{if(gen!==this.generation)s.getTracks().forEach(t=>t.stop());},()=>{});
      const stream=await Promise.race([acquire,new Promise((_,reject)=>{permissionTimer=setTimeout(()=>reject(new Error('timeout')),20000);})]);clearTimeout(permissionTimer);
      if(gen!==this.generation){stream.getTracks().forEach(t=>t.stop());return;}
      this.stream=stream;stream.getAudioTracks().forEach(t=>t.addEventListener?.('ended',()=>{if(gen===this.generation)this.stop('마이크 연결이 끊겼어요. 다시 시작해 주세요.');}));
      const secret=await this.request('/realtime/client_secrets',{expires_after:{anchor:'created_at',seconds:60},session:config},key);key='';
      if(gen!==this.generation)return;if(!secret.value)throw new Error('missing-client-secret');
      const peer=new RTCPeerConnection();this.pc=peer;const dc=peer.createDataChannel('oai-events');this.dc=dc;
      const opened=new Promise((resolve,reject)=>{dc.addEventListener('open',resolve,{once:true});dc.addEventListener('error',()=>reject(new Error('channel-error')),{once:true});});opened.catch(()=>{});
      dc.addEventListener('message',e=>{if(gen===this.generation){let event;try{event=JSON.parse(e.data);}catch{return;}this.receive(event,gen);}});
      dc.addEventListener('close',()=>{if(gen===this.generation)this.stop('음성 연결이 종료됐어요. 다시 시작해 주세요.');});
      peer.ontrack=e=>{if(gen!==this.generation)return;this.audio.srcObject=e.streams[0]||new MediaStream([e.track]);this.audio.play().catch(()=>this.onState('audio-blocked'));};
      peer.onconnectionstatechange=()=>{
        if(gen!==this.generation)return;
        if(['failed','closed'].includes(peer.connectionState))this.stop('네트워크 연결이 끊겼어요. 다시 시작해 주세요.');
        if(peer.connectionState==='disconnected'){clearTimeout(this.disconnectTimer);this.disconnectTimer=setTimeout(()=>{if(gen===this.generation&&peer.connectionState==='disconnected')this.stop('네트워크 연결이 끊겼어요.');},8000);}
        if(peer.connectionState==='connected')clearTimeout(this.disconnectTimer);
      };
      stream.getAudioTracks().forEach(t=>peer.addTrack(t,stream));
      const offer=await peer.createOffer();await peer.setLocalDescription(offer);
      const answer=await this.request('/realtime/calls',offer.sdp,secret.value,true);secret.value='';
      if(gen!==this.generation)return;await peer.setRemoteDescription({type:'answer',sdp:answer});
      await Promise.race([opened,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),15000);})]);clearTimeout(timer);
      if(gen!==this.generation)return;
      this.connecting=false;this.active=true;this.started=Date.now();this.lastTurn=Date.now();this.onState('listening');
      this.send({type:'conversation.item.create',item:{type:'message',role:'system',content:[{type:'input_text',text:'수업이 시작되었습니다. 아래 앱의 칠판 상태를 사용하세요. 상태가 없을 때만 lesson_state로 확인하세요. AI 선생님 조달봉이라고 한 문장으로 인사하고 현재 문제에 관한 짧은 질문 하나를 하세요. 버튼 안내 금지.\n'+JSON.stringify(initialState)}]}});
      this.send({type:'response.create'});
    }catch(e){if(gen===this.generation){this.stop('');this.onError(errorMessage(e)+(e.code?` (${e.code})`:''));}}
    finally{key='';clearTimeout(timer);clearTimeout(permissionTimer);}
  }
  receive(e,gen=this.generation){
    if(gen!==this.generation)return;
    if(e.type==='input_audio_buffer.speech_started'){
      this.userSpeaking=true;this.lastTurn=Date.now();this.toolRounds=0;
      if(!this.paused)this.onState('hearing');
    }
    if(e.type==='input_audio_buffer.speech_stopped'){this.userSpeaking=false;this.lastTurn=Date.now();if(!this.paused)this.onState('thinking');}
    if(e.type==='conversation.item.input_audio_transcription.completed')this.onText('user',String(e.transcript??'').slice(0,400));
    if(e.type==='response.created'){
      this.responding=true;this.text='';this.totalResponses++;
      if(this.totalResponses>160){this.stop('테스트 응답 제한에 도달했어요. 새 수업으로 다시 시작해 주세요.');return;}
      if(this.paused)this.interrupt();
    }
    if(e.type==='response.output_audio_transcript.delta'||e.type==='response.audio_transcript.delta'){
      if(!this.paused){this.text=(this.text+String(e.delta??'')).slice(0,1500);this.onText('teacher',this.text);}
    }
    if(e.type==='response.output_audio_transcript.done'||e.type==='response.audio_transcript.done'){
      if(!this.paused)this.onText('teacher',String(e.transcript??this.text).slice(0,1500));
    }
    if(e.type==='output_audio_buffer.started'&&!this.paused)this.onState('speaking');
    if((e.type==='output_audio_buffer.stopped'||e.type==='output_audio_buffer.cleared')&&!this.paused&&!this.userSpeaking)this.onState('listening');
    if(e.type==='response.done'){
      this.responding=false;if(e.response?.usage)this.onUsage(e.response.usage);
      if(this.paused||!this.active)return;
      if(e.response?.status==='failed'){this.onError('응답 생성에 실패했어요. 잠시 후 다시 말하거나 재연결해 주세요.');return;}
      if(e.response?.status!=='completed')return;
      const tools=(e.response?.output??[]).filter(i=>i.type==='function_call');
      if(!tools.length)return;
      if(++this.toolRounds>5){this.stop('수업 동작이 반복되어 연결을 안전하게 멈췄어요. 다시 시작해 주세요.');return;}
      let ended=false;
      for(const item of tools){
        if(!item.call_id)continue;
        let result=this.calls.get(item.call_id);
        if(!result){try{result=this.onTool(item.name,JSON.parse(item.arguments));}catch{result={ok:false,error:'INVALID_ARGUMENTS'};}this.calls.set(item.call_id,result);if(this.calls.size>200)this.calls.delete(this.calls.keys().next().value);}
        this.send({type:'conversation.item.create',item:{type:'function_call_output',call_id:item.call_id,output:JSON.stringify(result)}});
        ended ||= !!result.end;
        if(ended)break;
      }
      if(ended){this.stop('오늘 수업은 여기까지! 마이크를 껐어요.');return;}
      if(gen===this.generation&&this.active&&!this.userSpeaking)this.send({type:'response.create'});
    }
    if(e.type==='error'){
      const code=e.error?.code??'';
      if(['response_cancel_not_active','conversation_already_has_active_response','input_audio_buffer_commit_empty'].includes(code))return;
      const safe=/^[a-z0-9_.-]{1,70}$/i.test(code)?` (${code})`:'';
      this.onError('실시간 요청 오류가 발생했어요. 연결을 종료하고 다시 시작해 주세요.'+safe);
    }
  }
  interrupt(){if(this.responding)this.send({type:'response.cancel'});this.send({type:'output_audio_buffer.clear'});this.responding=false;}
  pause(value){
    if(!this.active)return;this.paused=!!value;this.stream?.getAudioTracks().forEach(t=>t.enabled=!this.paused);
    if(this.paused)this.interrupt();
    const vad={...this.config.audio.input.turn_detection,create_response:!this.paused};
    this.send({type:'session.update',session:{type:'realtime',audio:{input:{turn_detection:vad}}}});
    this.send({type:'input_audio_buffer.clear'});this.onState(this.paused?'paused':'listening');this.lastTurn=Date.now();
  }
  say(text){
    if(!this.active||this.paused)return false;
    this.interrupt();this.toolRounds=0;this.lastTurn=Date.now();
    this.send({type:'conversation.item.create',item:{type:'message',role:'user',content:[{type:'input_text',text}]}});
    this.send({type:'response.create'});return true;
  }
  stop(message=''){
    this.generation++;this.active=false;this.connecting=false;this.paused=false;this.responding=false;this.userSpeaking=false;this.toolRounds=0;this.totalResponses=0;
    clearTimeout(this.disconnectTimer);for(const c of this.controllers)c.abort();this.controllers.clear();
    this.send({type:'response.cancel'});this.dc?.close();this.dc=null;
    this.pc?.close();this.pc=null;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;
    this.audio.pause();this.audio.srcObject=null;this.calls.clear();this.onState('stopped',message);
  }
}
