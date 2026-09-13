import {VoiceLesson} from './lesson.js';
import {SubscriptionTeacher,privateServiceURL} from './realtime.js';
import {privateService} from './runtime-config.js';
const $=id=>document.getElementById(id);
let lesson=new VoiceLesson(),timer,catalogReady=false;
const labels={stopped:'수업을 시작하면 말로 이어져요',connecting:'Codex 로그인과 음성 연결을 확인하고 있어요…',listening:'듣고 있어요 · 그냥 말해 주세요',speaking:'달봉쌤이 말하고 있어요',paused:'잠깐 쉬는 중 · 마이크와 재생 음소거','audio-blocked':'소리 켜기를 눌러 주세요'};
function notify(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('toast').hidden=true,8500);}
function render(){
 const s=lesson.state();$('lessonLabel').textContent=`${s.operation} · ${s.level==='easy'?'기초':'도전'}`;$('progress').textContent=`${s.number}번째 생각`;
 $('equation').replaceChildren(document.createTextNode(`${lesson.p.equation} = `));const em=document.createElement('em');em.textContent=s.answer!==undefined?String(s.answer):'?';$('equation').append(em);
 $('step').hidden=s.question_kind!=='small_step';$('step').textContent=s.question;
 $('boardLead').textContent=s.phase==='solved'?'네 힘으로 찾았어!':s.phase==='review'?'함께 방법을 배워봐요.':'정답보다, 네 생각이 궁금해.';
 $('score').textContent=s.solved||s.learned||s.skipped?`직접 ${s.solved} · 함께 ${s.learned} · 건너뜀 ${s.skipped}`:'천천히 생각해도 괜찮아요';
 $('visual').hidden=!s.visual;$('visual').replaceChildren();
 if(s.visual){const p=lesson.p,groups=p.op==='add'?[p.a,p.b]:p.op==='mul'?Array(p.b).fill(p.a):[p.a];const note=document.createElement('div');note.className='visual-note';note.textContent=p.op==='sub'?`${p.b}개를 덜어 내면 무엇이 남을까요?`:p.op==='div'?`이 물건을 그릇 ${p.b}개에 똑같이 나누어 생각해 보세요.`:'하나씩 세거나 묶어서 생각해 봐요.';$('visual').append(note);for(const n of groups){const box=document.createElement('div');box.className='dot-group';for(let i=0;i<n;i++){const dot=document.createElement('i');dot.className='dot';box.append(dot);}$('visual').append(box);}}
}
const client=new SubscriptionTeacher({audio:$('audio'),lesson,
 onState(state,message){document.body.className=state;$('state').textContent=message||labels[state]||state;$('start').hidden=client.active;$('during').hidden=!client.active;$('start').textContent=state==='connecting'?'연결 취소':'● 달봉쌤과 대화 시작';$('pause').textContent=client.paused?'▶ 다시 대화하기':'Ⅱ 잠깐 쉬기';$('pause').setAttribute('aria-pressed',String(client.paused));$('unlock').hidden=!client.playbackBlocked;$('micNote').textContent=client.active?(client.paused?'마이크와 선생님 재생이 음소거됐어요. 세션 시간은 계속 흘러요.':'마이크 켜짐 · 인식된 말로 앱이 채점해요.'):'수업 중에는 마이크 음성이 OpenAI로 전송돼요.';if(state==='stopped')$('clock').textContent='마이크 꺼짐';},
 onText(who,text){if(who==='teacher')$('teacherText').textContent=text;else{$('heard').textContent=`내 말: ${text}`;$('heard').hidden=!text;}},
 onLesson(result){render();if(result.feedback||result.suggested_coaching)$('teacherText').textContent=result.feedback||result.suggested_coaching;if(result.error==='PRIVATE_INPUT')notify('개인정보로 보이는 글은 추가 전송하지 않았어요.');if(result.end)$('consent').checked=false;},onError:notify
});
async function refreshCatalog(){
 catalogReady=false;$('connect').disabled=true;$('refreshCatalog').disabled=true;$('accountStatus').textContent='Codex ChatGPT 로그인 확인 중…';
 try{const c=await client.catalog();$('voice').replaceChildren();for(const voice of c.voices){const option=document.createElement('option');option.value=voice;option.textContent=voice;$('voice').append(option);}$('voice').value=c.defaultVoice;catalogReady=true;$('accountStatus').textContent='Codex ChatGPT 로그인 확인 · 마이크 꺼짐';}
 catch{$('accountStatus').textContent='비공개 서비스에서 Codex ChatGPT 로그인을 확인해 주세요. GitHub Pages만으로는 음성 연결을 할 수 없어요.';}
 finally{$('connect').disabled=!catalogReady;$('refreshCatalog').disabled=false;}
}
async function openSetup(){await client.stop();$('setupError').textContent='';$('setup').showModal();await refreshCatalog();}
async function start(){
 if(client.connecting){await client.stop('연결을 취소했어요.');return;}
 if(!$('consent').checked||!catalogReady){await openSetup();return;}
 if(lesson.finished){lesson=new VoiceLesson();client.lesson=lesson;render();}
 $('audio').play().catch(()=>{});$('sessionInfo').textContent=`Codex 구독 · ${$('voice').value} · AI 음성`;
 try{await client.start({consent:true,voice:$('voice').value});}catch(e){notify(e.message);}
}
$('settings').addEventListener('click',openSetup);$('start').addEventListener('click',start);
$('refreshCatalog').addEventListener('click',refreshCatalog);
$('connect').addEventListener('click',()=>{if(!$('consent').checked){$('setupError').textContent='성인 본인 테스트·음성 전송 안내를 확인해 주세요.';return;}$('setup').close();void start();});
$('pause').addEventListener('click',()=>client.pause(!client.paused));$('end').addEventListener('click',()=>{void client.stop('수업을 마쳤어요.');$('consent').checked=false;$('message').value='';$('heard').textContent='';});
$('unlock').addEventListener('click',()=>client.unlockAudio().catch(()=>notify('미디어 음량과 브라우저 재생 권한을 확인해 주세요.')));
for(const id of ['closeSetup','preview'])$(id).addEventListener('click',()=>$('setup').close());
$('openPrivate').addEventListener('click',()=>{try{location.assign(privateServiceURL($('privateURL').value.trim()));}catch(e){$('setupError').textContent=e.message;}});
$('textForm').addEventListener('submit',async e=>{e.preventDefault();const text=$('message').value.trim();if(!text)return;if(await client.say(text)){$('message').value='';notify('앱 상태를 갱신했어요. 글 전송에 대한 음성 응답은 보장되지 않아요.');}else notify('먼저 수업을 시작하거나 음소거를 해제해 주세요.');});
document.addEventListener('visibilitychange',()=>{if(document.hidden)void client.stop('화면을 벗어나 수업을 종료했어요.');});
window.addEventListener('pagehide',()=>{void client.stop('',true);$('message').value='';$('heard').textContent='';$('teacherText').textContent='';$('consent').checked=false;});
window.addEventListener('pageshow',e=>{if(e.persisted)void client.stop('다시 연결해 주세요.');});
setInterval(()=>{if(client.active){const sec=Math.floor((Date.now()-client.started)/1000);$('clock').textContent=`${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')} / 10:00`;}},1000);
render();
if(privateService){try{const url=privateServiceURL(privateService);$('privateURL').value=url;if(new URL(url).origin!==location.origin)location.assign(url);else void openSetup();}catch(e){$('setup').showModal();$('setupError').textContent=e.message;}}
else void openSetup();
