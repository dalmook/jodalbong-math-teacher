import {OPERATIONS,makeProblem,newProgress,grade,teacherCard,localDecision,protectInput,parseAnswer} from './engine.js';
import {TutorAPI} from './api.js';
const $=id=>document.getElementById(id);
const api=new TutorAPI(n=>{$('usageLabel').textContent=`API 요청 ${n}회`;});
let problem=makeProblem('add','easy',Math.random,true), progress=newProgress();
let op='add',level='easy',number=1,solved=0,learned=0,muted=false,verified=false,busy=false;
let epoch=0,decisionSeq=0,speechSeq=0,lastActivity=Date.now(),toastTimer;
let currentText='',audioURL='',recording=null,recordPending=false;
const audio=new Audio();audio.setAttribute('playsinline','');
const voiceCache=new Map();
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6500);}
function setBusy(value){busy=value;document.body.classList.toggle('ai-busy',value);$('sendChat').disabled=value;$('micButton').disabled=value&&!recording;}
function status(){
  const el=$('connectionStatus');el.replaceChildren();const dot=document.createElement('i');el.append(dot,document.createTextNode(api.connected?(verified?'AI 연결 확인 · 정답 대신 힌트':'API 키 적용 · 첫 요청 때 연결 확인'):'규칙 기반 미리보기 · GPT 미연결'));el.classList.toggle('connected',api.connected&&verified);
  $('settingsButton').textContent=api.connected?'API 설정':'API 연결';
}
function confirmAPI(){verified=true;status();}
function clearAudio(){speechSeq++;audio.pause();audio.removeAttribute('src');audio.load();if(audioURL){URL.revokeObjectURL(audioURL);audioURL='';}document.body.classList.remove('speaking');}
function unlockAudio(){
  // User-gesture unlock for Safari. The same audio element is reused for speech.
  if(audio.src&&!audio.paused)return;
  const buffer=new ArrayBuffer(46),v=new DataView(buffer);const txt=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
  txt(0,'RIFF');v.setUint32(4,38,true);txt(8,'WAVE');txt(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,16000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);txt(36,'data');v.setUint32(40,2,true);
  if(audioURL)URL.revokeObjectURL(audioURL);audioURL=URL.createObjectURL(new Blob([buffer],{type:'audio/wav'}));audio.src=audioURL;audio.play().catch(()=>{});
}
audio.addEventListener('ended',()=>document.body.classList.remove('speaking'));
audio.addEventListener('error',()=>document.body.classList.remove('speaking'));
async function speak(text,manual=false){
  clearAudio();if(muted&&!manual)return;if(!api.connected){if(manual)toast('화면 미리보기는 소리가 없어요. API 키를 연결하면 AI 음성으로 읽어 줘요.');return;}
  const seq=speechSeq,ver=epoch;
  try{
    let blob=voiceCache.get(text);if(!blob){blob=await api.speak(text);confirmAPI();if(seq!==speechSeq||ver!==epoch||!api.connected)return;if(voiceCache.size>=20)voiceCache.delete(voiceCache.keys().next().value);voiceCache.set(text,blob);}
    if(seq!==speechSeq||ver!==epoch||document.hidden)return;
    if(audioURL)URL.revokeObjectURL(audioURL);audioURL=URL.createObjectURL(blob);audio.src=audioURL;
    try{await audio.play();document.body.classList.add('speaking');}catch{toast('휴대폰에서 자동 재생이 막혔어요. 말풍선의 ▷ 버튼을 눌러 주세요.');}
  }catch(e){if(seq===speechSeq&&ver===epoch&&api.connected){toast(e.message);$('teacherSource').textContent='음성 오류 · 글로 수업을 계속할 수 있어요';}}
}
function showCard(title,text,source='앱의 수업 안내',read=true){
  $('cardTitle').textContent=title;$('teacherText').textContent=text;currentText=text;
  $('teacherSource').textContent=api.connected?source:'정해진 안내 · GPT 미연결';
  $('hintDots').textContent=Array.from({length:3},(_,i)=>i<progress.hint?'●':'○').join(' ');
  if(read)speak(text);else clearAudio();
}
function interrupt(){decisionSeq++;api.abort();clearAudio();stopRecording(true);setBusy(false);}
function renderProblem(){
  $('operandA').textContent=problem.a;$('operandB').textContent=problem.b;$('operator').textContent=problem.sign;
  $('equationResult').textContent=progress.phase==='solving'?'?':problem.answer;
  $('lessonLabel').textContent=`LESSON ${String(Object.keys(OPERATIONS).indexOf(op)+1).padStart(2,'0')} · ${problem.label}`;
  $('progressLabel').textContent=`${number} / 5 문제`;
  $('boardInvitation').textContent=progress.phase==='solving'?'답을 찾는 길, 함께 만들어 볼까?':progress.phase==='solved'?'스스로 찾았어. 이제 이유까지 알아보자!':'풀이를 배우고, 다음에 다시 도전해요.';
  $('boardNote').textContent=progress.phase==='solving'?'정답보다 네 생각이 궁금해!':progress.phase==='solved'?'✦ 직접 찾은 답':'✦ 함께 배운 문제';
  $('microPanel').hidden=!progress.micro;
  $('microQuestion').textContent=progress.micro?problem.steps[progress.step].ask:'';
  $('answerLabel').textContent=progress.micro?'작은 질문의 답':'내가 찾은 답';
  $('submitAnswer').hidden=progress.phase!=='solving';$('nextProblem').hidden=progress.phase==='solving';
  $('nextProblem').textContent=number>=5?'수업 마치기 →':'다음 문제 →';
  $('answerInput').disabled=progress.phase!=='solving';
  for(const b of $('keypad').querySelectorAll('button'))b.disabled=progress.phase!=='solving';
  $('learnSolution').disabled=progress.phase!=='solving';
  $('trailStars').textContent=solved+learned?`✦ 직접 ${solved}문제 · 함께 ${learned}문제`:'✦ 생각 연습 중';
  for(const b of document.querySelectorAll('[data-op]'))b.setAttribute('aria-pressed',String(b.dataset.op===op));
}
function newProblem(reset=false){
  interrupt();epoch++;if(reset){number=1;solved=0;learned=0;}
  const prev=problem.equation;problem=makeProblem(op,level);for(let i=0;i<5&&problem.equation===prev;i++)problem=makeProblem(op,level);
  progress=newProgress();$('answerInput').value='';$('chatInput').value='';$('lastMessage').hidden=true;renderProblem();
  showCard('새로운 생각 한 걸음',`${problem.a} ${OPERATIONS[op].verb} ${problem.b}. 어떻게 시작할지 먼저 생각해 볼까?`);
}
function runAction(decision,source){
  const card=teacherCard(problem,progress,decision);renderProblem();showCard(card.title,card.text,source);
  if(card.kind==='visual')openVisual();
  if(card.kind==='step'){$('answerInput').value='';}
}
function localCoach(action){
  interrupt();unlockAudio();if(action==='ask_thinking'){$('chatInput').focus();showCard('네 생각을 들려줘','어디까지 생각했어? 어떻게 세었는지, 무엇이 헷갈리는지 한 가지만 말해 줄래?');return;}
  runAction({action,focus:'unsure'},'정해진 힌트 · 앱이 지도');
}
async function askAI(text){
  const safe=protectInput(text);if(safe===null){toast('전화번호·이메일·API 키는 보내지 않아요. 산수에 관한 생각만 적어 주세요.');return;}
  if(!safe)return;if(busy){toast('앞의 생각을 확인하고 있어요.');return;}
  const candidate=parseSpokenNumber(safe);
  if(candidate!==null&&progress.phase==='solving'){$('answerInput').value=String(candidate);$('chatInput').value='';toast('말한 수를 답 칸에 넣었어요. 맞게 입력됐는지 보고 확인하기를 눌러 주세요.');return;}
  interrupt();const seq=++decisionSeq,ver=epoch;unlockAudio();
  $('lastMessage').textContent=`내 생각: ${safe}`;$('lastMessage').hidden=false;$('chatInput').value='';
  const local=localDecision(safe);
  if(local.action==='safety'){runAction(local,'앱의 안전 안내');return;}
  if(!api.connected){runAction(local,'규칙 기반 체험 · GPT 미연결');return;}
  setBusy(true);$('teacherSource').textContent='AI가 다음 질문을 고르고 있어요…';
  try{
    let d=await api.decide(problem,progress,safe);if(seq!==decisionSeq||ver!==epoch||!api.connected)return;confirmAPI();
    // Obvious answer-seeking/injection is additionally intercepted locally.
    if(local.focus==='request_answer')d=local;
    runAction(d,'AI가 지도 방식 선택 · 앱이 문장 제공');
  }catch(e){if(seq===decisionSeq&&ver===epoch){toast(e.message);showCard('연결이 잠시 어려워요','음성 연결이 안 되어도 문제는 풀 수 있어. 아래 힌트나 작은 단계 버튼을 눌러 줘.','API 오류 · 앱 안내',false);}}
  finally{if(seq===decisionSeq)setBusy(false);}
}
function parseSpokenNumber(text){
  const stripped=text.trim().replace(/[.!?。]/g,'').replace(/^(답은|정답은|제 답은|내 답은)\s*/,'').replace(/\s*(이에요|이요|예요|입니다|같아요|이라고 생각해요|라고 생각해요)$/,'').replace(/\s/g,'');
  if(/^\d{1,3}$/.test(stripped))return Number(stripped);
  const native=['영','하나','둘','셋','넷','다섯','여섯','일곱','여덟','아홉','열','열하나','열둘','열셋','열넷','열다섯','열여섯','열일곱','열여덟','열아홉','스물'];
  if(native.includes(stripped))return native.indexOf(stripped);
  const dig={'영':0,'공':0,'일':1,'이':2,'삼':3,'사':4,'오':5,'육':6,'칠':7,'팔':8,'구':9};
  if(Object.hasOwn(dig,stripped))return dig[stripped];
  if(/^([일이삼사오육칠팔구]?십)([일이삼사오육칠팔구]?)$/.test(stripped)){const [t,u]=stripped.split('십');return (t?dig[t]:1)*10+(u?dig[u]:0);}
  return null;
}
function inputDigit(d){if(progress.phase!=='solving')return;const el=$('answerInput');if(d==='clear')el.value='';else if(d==='back')el.value=el.value.slice(0,-1);else if(el.value.length<3)el.value=(el.value==='0'?'':el.value)+d;}
function submit(){
  const value=parseAnswer($('answerInput').value);if(value===null){toast('숫자판에서 네가 생각한 수를 먼저 눌러 줘.');return;}
  interrupt();unlockAudio();const result=grade(problem,progress,value);
  if(result.kind==='ignored')return;
  if(result.kind==='correct'){solved++;showCard('네 힘으로 해냈어! ✦',result.text);}
  else if(result.kind==='step_correct') {showCard(progress.micro?'좋아! 다음 한 걸음':'작은 단계 성공!',result.text+(progress.micro?' '+problem.steps[progress.step].ask:''));$('answerInput').value='';}
  else{showCard(result.kind==='step_wrong'?'작은 질문을 다시 보자':'다른 길도 찾아보자',result.text);$('answerInput').value='';}
  renderProblem();
}
function finishSession(message='키와 대화·녹음 데이터를 이 탭에서 지웠어요.'){interrupt();epoch++;api.clear();voiceCache.clear();verified=false;$('apiKeyInput').value='';$('chatInput').value='';$('lastMessage').textContent='';$('lastMessage').hidden=true;$('consentCheck').checked=false;status();showCard('연결을 종료했어요','다시 연결하기 전까지는 정해진 힌트로 연습할 수 있어. API 키는 이 탭에서 지웠어.','',false);toast(message);}
// Voice capture is explicit and time-bounded. Nothing auto-submits a final answer.
function stopRecording(cancel=false){
  if(recordPending&&cancel){epoch++;recordPending=false;}
  if(!recording)return;recording.cancelled ||= cancel;clearTimeout(recording.timer);clearInterval(recording.tick);
  if(recording.recorder.state!=='inactive')recording.recorder.stop();recording.stream.getTracks().forEach(t=>t.stop());
  $('micButton').classList.remove('recording');$('micLabel').textContent='눌러서 생각 말하기';
}
async function toggleMic(){
  lastActivity=Date.now();if(recording){stopRecording(false);return;}if(recordPending||busy)return;
  if(!api.connected){$('settingsDialog').showModal();toast('본인 API 키를 먼저 연결해 주세요.');return;}
  if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){toast('HTTPS 주소를 Chrome 또는 Safari에서 열어 주세요. 마이크가 지원되지 않으면 글로 입력할 수 있어요.');return;}
  interrupt();unlockAudio();recordPending=true;const ver=epoch;$('micButton').disabled=true;$('micLabel').textContent='마이크 권한을 확인해 주세요';
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
    if(ver!==epoch||!api.connected||document.hidden){stream.getTracks().forEach(t=>t.stop());return;}
    const type=['audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));
    let recorder;try{recorder=new MediaRecorder(stream,type?{mimeType:type}:{});}catch(e){stream.getTracks().forEach(t=>t.stop());throw e;}
    const rec={recorder,stream,cancelled:false,chunks:[],timer:null,tick:null,start:Date.now()};recording=rec;
    recorder.addEventListener('dataavailable',e=>{if(e.data.size)rec.chunks.push(e.data);});
    recorder.addEventListener('error',()=>{stopRecording(true);toast('녹음 중 오류가 생겼어요. 글로 입력하거나 다시 시도해 주세요.');});
    recorder.addEventListener('stop',async()=>{
      clearTimeout(rec.timer);clearInterval(rec.tick);rec.stream.getTracks().forEach(t=>t.stop());if(recording===rec)recording=null;
      $('micButton').classList.remove('recording');$('micLabel').textContent='눌러서 생각 말하기';
      if(rec.cancelled||ver!==epoch||!api.connected){rec.chunks=[];return;}
      const blob=new Blob(rec.chunks,{type:recorder.mimeType||'audio/webm'});rec.chunks=[];setBusy(true);const seq=++decisionSeq;$('micNote').textContent='음성을 글로 바꾸고 있어요…';
      try{const text=await api.transcribe(blob);if(ver!==epoch||seq!==decisionSeq||!api.connected)return;confirmAPI();
        if(protectInput(text)===null){toast('인식된 말에 개인정보로 보이는 내용이 있어 다음 AI 요청은 보내지 않았어요.');return;}
        $('chatInput').value=text;$('lastMessage').textContent='음성 인식 완료 · 아래 글을 확인하고 ↑를 눌러 주세요.';$('lastMessage').hidden=false;toast('인식한 글을 확인해 주세요. 아직 답을 제출하지 않았어요.');
      }catch(e){if(ver===epoch&&seq===decisionSeq)toast(e.message);}
      finally{if(seq===decisionSeq)setBusy(false);$('micNote').textContent='다시 누르면 녹음 종료 · 인식한 글을 확인한 뒤 보내요';}
    });
    recorder.start();$('micButton').classList.add('recording');$('micLabel').textContent='듣고 있어요 · 누르면 끝';
    rec.timer=setTimeout(()=>stopRecording(false),12000);rec.tick=setInterval(()=>{$('micLabel').textContent=`듣고 있어요 · ${Math.max(0,12-Math.floor((Date.now()-rec.start)/1000))}초`;},400);
  }catch(e){const names={NotAllowedError:'마이크 권한이 꺼져 있어요. 주소창의 사이트 설정에서 마이크를 허용해 주세요.',NotFoundError:'마이크를 찾지 못했어요. 글로 입력하거나 마이크를 연결해 주세요.',NotReadableError:'다른 앱이 마이크를 사용하고 있을 수 있어요. 그 앱을 닫고 다시 시도해 주세요.'};toast(names[e.name]??'이 브라우저에서 녹음을 시작하지 못했어요. 글로도 테스트할 수 있어요.');}
  finally{recordPending=false;$('micButton').disabled=busy;if(!recording)$('micLabel').textContent='눌러서 생각 말하기';}
}
function makeDot(alt=false){const b=document.createElement('button');b.className='dot'+(alt?' alt':'');b.setAttribute('aria-label','센 물건 표시하기');b.addEventListener('click',()=>{b.classList.toggle('marked');b.setAttribute('aria-pressed',String(b.classList.contains('marked')));});return b;}
function group(label,n,alt=false){const box=document.createElement('div');box.className='counter-group';const p=document.createElement('p');p.textContent=label;const row=document.createElement('div');row.className='dots';for(let i=0;i<n;i++)row.append(makeDot(alt));box.append(p,row);return box;}
function renderVisual(){
  const root=$('visualContent');root.replaceChildren();const {a,b,op}=problem;
  if(op==='add'){$('visualDescription').textContent='두 묶음을 이어서 세어 보세요. 누른 동그라미는 흐려져요.';root.append(group(`첫 번째 묶음 · ${a}개`,a),group(`두 번째 묶음 · ${b}개`,b,true));}
  if(op==='sub'){$('visualDescription').textContent=`${a}개에서 ${b}개를 눌러 흐리게 만들고, 남은 것을 세어 보세요.`;root.append(group('처음에 있던 물건',a));}
  if(op==='mul'){$('visualDescription').textContent=`${a}개씩 들어 있는 묶음 ${b}개예요. 하나씩 표시하며 세어 보세요.`;for(let i=0;i<b;i++)root.append(group(`${i+1}번째 묶음`,a,i%2===1));}
  if(op==='div'){
    $('visualDescription').textContent=`${a}개를 그릇 ${b}개에 똑같이 나누어요. 아래 버튼을 눌러 한 개씩 나누어 보세요.`;
    let placed=0;const baskets=document.createElement('div');baskets.className='baskets';const rows=[];
    for(let i=0;i<b;i++){const box=document.createElement('div');box.className='basket';const label=document.createElement('span');label.textContent=`그릇 ${i+1}`;const row=document.createElement('div');row.className='dots';rows.push(row);box.append(label,row);baskets.append(box);}
    const btn=document.createElement('button');btn.className='primary';btn.textContent='하나씩 골고루 나누기';btn.addEventListener('click',()=>{if(placed>=a)return;rows[placed%b].append(makeDot(true));placed++;if(placed===a){btn.disabled=true;btn.textContent='다 나누었어요 · 한 그릇을 세어 보세요';}});root.append(baskets,btn);
  }
}
function openVisual(){renderVisual();if(!$('visualDialog').open)$('visualDialog').showModal();}
$('visualButton').addEventListener('click',openVisual);$('resetVisual').addEventListener('click',renderVisual);$('closeVisual').addEventListener('click',()=>$('visualDialog').close());
$('keypad').addEventListener('click',e=>{const b=e.target.closest('[data-digit]');if(b)inputDigit(b.dataset.digit);});
$('submitAnswer').addEventListener('click',submit);
$('backToMain').addEventListener('click',()=>{interrupt();progress.micro=false;$('answerInput').value='';renderProblem();showCard('전체 문제로 돌아왔어','작은 단계에서 알아낸 것을 떠올려 봐. 이제 전체 답을 생각해 보자.');});
$('nextProblem').addEventListener('click',()=>{if(number>=5){interrupt();$('summaryText').textContent=`직접 찾아낸 문제 ${solved}개, 풀이를 함께 배운 문제 ${learned}개. 모두 다섯 문제를 연습했어요.`;$('summaryDialog').showModal();}else{number++;newProblem();}});
$('restartLesson').addEventListener('click',()=>{$('summaryDialog').close();newProblem(true);});
for(const b of document.querySelectorAll('[data-op]'))b.addEventListener('click',()=>{op=b.dataset.op;newProblem(true);});
$('levelSelect').addEventListener('change',()=>{level=$('levelSelect').value;newProblem(true);});
for(const b of document.querySelectorAll('[data-coach]'))b.addEventListener('click',()=>localCoach(b.dataset.coach));
$('chatForm').addEventListener('submit',e=>{e.preventDefault();askAI($('chatInput').value);});
$('micButton').addEventListener('click',toggleMic);
$('replayButton').addEventListener('click',()=>{unlockAudio();speak(currentText,true);});
$('soundButton').addEventListener('click',()=>{muted=!muted;$('soundButton').textContent=muted?'♪':'♬';$('soundButton').setAttribute('aria-label',muted?'선생님 음성 켜기':'선생님 음성 끄기');$('soundButton').setAttribute('aria-pressed',String(!muted));if(muted)clearAudio();toast(muted?'선생님 음성을 껐어요. 글로 계속할 수 있어요.':'선생님 음성을 켰어요.');});
$('settingsButton').addEventListener('click',()=>{interrupt();$('settingsError').textContent='';$('apiKeyInput').value='';$('settingsDialog').showModal();});
$('connectButton').addEventListener('click',()=>{
  $('settingsError').textContent='';if(!$('consentCheck').checked){$('settingsError').textContent='성인 테스트 및 전송·사용료 안내를 확인해 주세요.';return;}
  try{interrupt();api.connect($('apiKeyInput').value.trim());$('apiKeyInput').value='';verified=false;voiceCache.clear();status();$('settingsDialog').close();unlockAudio();showCard('달봉쌤 수업에 온 걸 환영해','나는 산수 연습을 돕는 AI 선생님이야. 답을 대신 말하기보다, 네 생각을 듣고 한 단계씩 도와줄게.');}catch(e){$('settingsError').textContent=e.message;}
});
$('settingsDialog').addEventListener('close',()=>{$('apiKeyInput').value='';});
$('previewButton').addEventListener('click',()=>{$('settingsDialog').close();if(api.connected)finishSession();showCard('키 없이 먼저 둘러봐요','지금은 정해진 힌트로 체험하는 모드야. 숫자판으로 풀거나 힌트, 작은 단계 버튼을 눌러 봐. 실제 AI와 음성은 API 키 연결 후 쓸 수 있어.','',false);});
$('endSession').addEventListener('click',()=>finishSession());
$('learnSolution').addEventListener('click',()=>{interrupt();$('solutionDialog').showModal();});
$('cancelSolution').addEventListener('click',()=>$('solutionDialog').close());
$('confirmSolution').addEventListener('click',()=>{$('solutionDialog').close();if(progress.phase!=='solving')return;interrupt();progress.phase='review';progress.micro=false;learned++;renderProblem();showCard('이번 문제는 함께 배워요',problem.explanation+' 다음 문제에서는 이 방법을 직접 써 보자.');});
document.addEventListener('keydown',e=>{lastActivity=Date.now();if(document.querySelector('dialog[open]')||(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)&&document.activeElement?.id!=='answerInput'))return;if(/^\d$/.test(e.key))inputDigit(e.key);else if(e.key==='Backspace'){e.preventDefault();inputDigit('back');}else if(e.key==='Enter')submit();});
document.addEventListener('pointerdown',()=>{lastActivity=Date.now();},{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden)interrupt();});
window.addEventListener('pagehide',()=>{interrupt();epoch++;api.clear();voiceCache.clear();$('apiKeyInput').value='';$('chatInput').value='';$('lastMessage').textContent='';verified=false;});
window.addEventListener('pageshow',()=>status());
setInterval(()=>{if(api.connected&&Date.now()-lastActivity>15*60*1000)finishSession('15분 동안 사용하지 않아 API 키를 지웠어요.');},30000);
renderProblem();status();showCard('오늘도 같이 한 걸음','안녕! 일타강사 조달봉이야. 답보다 네 생각이 궁금해. 어떻게 시작해 볼까?','',false);$('settingsDialog').showModal();
