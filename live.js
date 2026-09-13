import {VoiceLesson,LIVE_MODEL,sessionConfig} from './lesson.js?v=0.2.0';
import {RealtimeTeacher} from './realtime.js?v=0.2.0';
import {protectInput} from './engine.js';
const $=id=>document.getElementById(id);
let lesson=new VoiceLesson(),apiKey='',maxMinutes=10,model=LIVE_MODEL,captions=false,timer,uiState='stopped',responses=0,lastKeyUse=Date.now();
const labels={stopped:'한 번 시작하면, 말로 쭉 이어져요',connecting:'마이크와 실시간 수업을 연결하고 있어요…',listening:'듣고 있어요 · 그냥 말해 주세요',hearing:'응, 듣고 있어요…',thinking:'네 생각을 살펴보고 있어요',speaking:'달봉쌤이 말하고 있어요 · 중간에 질문해도 돼요',paused:'잠깐 쉬는 중 · 마이크 꺼짐','audio-blocked':'소리 켜기를 한 번 눌러 주세요'};
function notify(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('toast').hidden=true,8500);}
function render(){
  const s=lesson.state();$('lessonLabel').textContent=`${s.operation} · ${s.level==='easy'?'기초':'도전'}`;
  $('progress').textContent=`${s.number}번째 생각`;
  $('equation').replaceChildren(document.createTextNode(`${lesson.p.equation} = `));
  const em=document.createElement('em');em.textContent=s.answer!==undefined?String(s.answer):'?';$('equation').append(em);
  $('step').hidden=s.question_kind!=='small_step';$('step').textContent=s.question;
  $('boardLead').textContent=s.phase==='solved'?'네 힘으로 찾았어!':s.phase==='review'?'함께 방법을 배워봐요.':'정답보다, 네 생각이 궁금해.';
  $('score').textContent=s.solved||s.learned||s.skipped?`직접 ${s.solved} · 함께 ${s.learned} · 건너뜀 ${s.skipped}`:'천천히 생각해도 괜찮아요';
  $('visual').hidden=!s.visual;$('visual').replaceChildren();
  if(s.visual){
    const p=lesson.p,groups=p.op==='add'?[p.a,p.b]:p.op==='mul'?Array(p.b).fill(p.a):[p.a];
    const note=document.createElement('div');note.className='visual-note';note.textContent=p.op==='sub'?`${p.b}개를 덜어 내면 무엇이 남을까요?`:p.op==='div'?`이 물건을 그릇 ${p.b}개에 똑같이 나누어 생각해 보세요.`:'하나씩 세거나 묶어서 생각해 봐요.';$('visual').append(note);
    for(const n of groups){const box=document.createElement('div');box.className='dot-group';for(let i=0;i<n;i++){const dot=document.createElement('i');dot.className='dot';box.append(dot);}$('visual').append(box);}
  }
}
const client=new RealtimeTeacher({audio:$('audio'),
  onState(state,message){
    uiState=state;document.body.className=state;$('state').textContent=message||labels[state]||state;
    const live=client?.active||false,connecting=state==='connecting';
    $('start').hidden=live;$('during').hidden=!live;$('start').textContent=connecting?'연결 취소':apiKey?'● 대화 다시 시작':'● 달봉쌤과 대화 시작';
    $('pause').textContent=state==='paused'?'▶ 다시 대화하기':'Ⅱ 잠깐 쉬기';
    $('pause').setAttribute('aria-pressed',String(state==='paused'));
    if(state==='audio-blocked')$('unlock').hidden=false;
    if(state==='stopped'){$('clock').textContent='마이크 꺼짐';$('unlock').hidden=true;if(message)notify(message);}
    $('micNote').textContent=live?(state==='paused'?'마이크가 꺼져 있어요. 다시 대화하기를 누르면 이어져요.':'마이크 켜짐 · 말이 끝나면 자동으로 답해요. 녹음·전송 버튼은 필요 없어요.'):'수업 중에는 마이크가 켜져요. 중간에 말을 끊고 질문해도 돼요.';
  },
  onText(who,text){if(who==='teacher')$('teacherText').textContent=text;else{$('heard').textContent=`내 말: ${text}`;$('heard').hidden=!text;}},
  onError(text){notify(text);$('state').textContent=text;},
  onUsage(){responses++;$('sessionInfo').textContent=`${model} · 응답 ${responses}회`;},
  onTool(name,args){
    const result=lesson.apply(name,args);render();
    if(result.end){apiKey='';$('consent').checked=false;$('apiKey').value='';}
    if(result.heard_number!==undefined){$('heard').textContent=`${name==='correct_hearing'?'다시 들은':'말한'} 답: ${result.heard_number}`;$('heard').hidden=false;}
    return result;
  }
});
function openSetup(){if(client.active||client.connecting)client.stop('설정을 열어 마이크를 껐어요.');$('setupError').textContent='';$('apiKey').value='';$('setup').showModal();}
function unlockAudio(){
  // Prime the same media element during the initiating user gesture (Safari).
  const b=new ArrayBuffer(46),v=new DataView(b);const put=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
  put(0,'RIFF');v.setUint32(4,38,true);put(8,'WAVE');put(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);put(36,'data');v.setUint32(40,2,true);
  const url=URL.createObjectURL(new Blob([b],{type:'audio/wav'}));$('audio').src=url;$('audio').play().catch(()=>{}).finally(()=>URL.revokeObjectURL(url));
}
async function start(){
  if(client.connecting){client.stop('연결을 취소했어요.');return;}
  if(!apiKey){openSetup();return;}
  if(lesson.finished)lesson=new VoiceLesson();render();responses=0;lastKeyUse=Date.now();unlockAudio();
  $('sessionInfo').textContent=`${model} · AI 음성`;try{await client.start(apiKey,sessionConfig({model,captions}),lesson.state());}catch{notify('키 또는 연결 설정을 확인해 주세요.');}
}
function clearSession(message='수업을 마쳤어요. 마이크를 끄고 API 키를 지웠어요.'){
  client.stop(message);apiKey='';$('apiKey').value='';$('consent').checked=false;$('message').value='';$('heard').textContent='';$('heard').hidden=true;
  $('teacherText').textContent='오늘도 한 걸음 배웠어요. 다시 시작할 때는 키를 넣어 주세요.';$('start').textContent='● 달봉쌤과 대화 시작';
}
$('connect').addEventListener('click',()=>{
  const key=$('apiKey').value.trim()||apiKey;
  if(!$('consent').checked){$('setupError').textContent='성인 테스트·마이크 전송·사용료 안내를 확인해 주세요.';return;}
  if(!/^sk-[A-Za-z0-9_-]{16,}$/.test(key)){$('setupError').textContent='sk-로 시작하는 본인 OpenAI API 키를 입력해 주세요.';return;}
  apiKey=key;model=$('model').value;captions=$('captions').checked;maxMinutes=Number($('minutes').value);
  $('apiKey').value='';$('setup').close();start();
});
$('settings').addEventListener('click',openSetup);$('start').addEventListener('click',start);
$('pause').addEventListener('click',()=>client.pause(!client.paused));$('end').addEventListener('click',()=>clearSession());
$('unlock').addEventListener('click',()=>$('audio').play().then(()=>{$('unlock').hidden=true;}).catch(()=>notify('휴대폰 미디어 음량과 블루투스 연결을 확인해 주세요.')));
$('closeSetup').addEventListener('click',()=>$('setup').close());$('preview').addEventListener('click',()=>$('setup').close());$('setup').addEventListener('close',()=>{$('apiKey').value='';});
$('textForm').addEventListener('submit',e=>{
  e.preventDefault();const text=protectInput($('message').value);
  if(text===null){notify('개인정보나 API 키는 보내지 마세요.');return;}if(!text)return;
  if(!client.say(text)){notify('먼저 대화를 시작하거나 쉬는 중인 수업을 다시 켜 주세요.');return;}
  $('message').value='';$('heard').textContent=`내 말: ${text}`;$('heard').hidden=false;
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(client.active||client.connecting))client.stop('화면을 벗어나 마이크와 연결을 종료했어요.');});
window.addEventListener('pagehide',()=>{client.stop('');apiKey='';$('apiKey').value='';$('message').value='';$('heard').textContent='';$('teacherText').textContent='';});
window.addEventListener('pageshow',e=>{if(e.persisted)clearSession('새 수업으로 다시 연결해 주세요.');});
setInterval(()=>{
  if(client.active){
    const sec=Math.floor((Date.now()-client.started)/1000);$('clock').textContent=`${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')} / ${maxMinutes}:00`;
    if(sec>=maxMinutes*60)clearSession(`${maxMinutes}분 테스트가 끝나 마이크를 껐어요. 다시 시작할 수 있어요.`);
    else if(Date.now()-client.lastTurn>120000)clearSession('2분 동안 대화가 없어 마이크와 연결을 종료했어요.');
    lastKeyUse=Date.now();
  }else if(apiKey&&!client.connecting&&Date.now()-lastKeyUse>15*60000)clearSession('15분 동안 사용하지 않아 API 키를 지웠어요.');
},1000);
render();$('setup').showModal();
