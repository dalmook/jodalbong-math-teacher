import test from 'node:test';
import assert from 'node:assert/strict';
import {VoiceLesson} from '../lesson.js';
import {SubscriptionTeacher} from '../realtime.js';
import * as lesson from '../subscription-lesson.js';

test('stable short numeric delta is acknowledged even when provider never sends done',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const l=new VoiceLesson(),calls=[];
 const teacher=new SubscriptionTeacher({lesson:l,audio:{},request:async(name,data)=>{calls.push({name,data});return {};}});teacher.active=true;
 await teacher.receive({id:1,type:'thread/realtime/transcript/delta',data:{role:'user',delta:'십삼'}});
 assert.equal(l.solved,0);t.mock.timers.tick(1200);await new Promise(r=>setImmediate(r));
 assert.equal(l.solved,1);assert.match(calls[0].data.feedback,/13이라고 들었어/);
 await teacher.receive({id:2,type:'thread/realtime/transcript/done',data:{role:'user',text:'13'}});
 assert.equal(l.solved,1);assert.equal(calls.length,1,'same final number must not repeat grading or speech');
});

test('missing done does not undo grade when learner says next; stale revisions never grade a new board',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const l=new VoiceLesson();const teacher=new SubscriptionTeacher({lesson:l,audio:{},request:async()=>({})});teacher.active=true;
 await teacher.receive({id:1,type:'thread/realtime/transcript/delta',data:{role:'user',delta:'13'}});t.mock.timers.tick(1200);await new Promise(r=>setImmediate(r));
 await teacher.receive({id:2,type:'thread/realtime/transcript/done',data:{role:'user',text:'네'}});assert.equal(l.solved,1);assert.equal(l.number,2);
 const fresh=new VoiceLesson();teacher.lesson=fresh;
 await teacher.receive({id:3,type:'thread/realtime/transcript/delta',data:{role:'user',delta:'13'}});t.mock.timers.tick(1200);await new Promise(r=>setImmediate(r));
 await teacher.say('건너뛰');await teacher.receive({id:4,type:'thread/realtime/transcript/done',data:{role:'user',text:'12'}});assert.equal(fresh.s.attempts,0);
});

test('busy context postpones stable number instead of losing it',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});let release;const l=new VoiceLesson();const teacher=new SubscriptionTeacher({lesson:l,audio:{},request:()=>new Promise(r=>release=r)});teacher.active=true;
 const first=teacher.say('전체 문제로');await teacher.receive({id:1,type:'thread/realtime/transcript/delta',data:{role:'user',delta:'13'}});t.mock.timers.tick(1200);assert.equal(l.solved,0);
 release({});await first;t.mock.timers.tick(1200);await new Promise(r=>setImmediate(r));assert.equal(l.solved,1);release({});await new Promise(r=>setImmediate(r));
});

test('late revised final transcript rolls back provisional score before regrading',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const l=new VoiceLesson();const teacher=new SubscriptionTeacher({lesson:l,audio:{},request:async()=>({})});teacher.active=true;
 await teacher.receive({id:1,type:'thread/realtime/transcript/delta',data:{role:'user',delta:'13'}});t.mock.timers.tick(1200);await new Promise(r=>setImmediate(r));assert.equal(l.solved,1);
 await teacher.receive({id:2,type:'thread/realtime/transcript/done',data:{role:'user',text:'12'}});
 assert.equal(l.solved,0);assert.equal(l.s.phase,'solving');assert.equal(l.s.attempts,1);
});

test('continued ambiguous delta is not graded; stopping clears provisional state across reconnect',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const l=new VoiceLesson();const teacher=new SubscriptionTeacher({lesson:l,audio:{pause(){}},request:async()=>({})});teacher.active=true;
 await teacher.receive({id:1,type:'thread/realtime/transcript/delta',data:{role:'user',delta:'13'}});t.mock.timers.tick(600);
 await teacher.receive({id:2,type:'thread/realtime/transcript/delta',data:{role:'user',delta:' 아니면 12'}});t.mock.timers.tick(1200);await new Promise(r=>setImmediate(r));assert.equal(l.solved,0);
 teacher.provisional={value:13};await teacher.stop();assert.equal(teacher.provisional,null);
});

test('streaming polls remain below the existing mobile gate request budget',async t=>{
 const waits=[];t.mock.method(Date,'now',()=>1000);t.mock.method(globalThis,'setTimeout',(fn,ms)=>{if(ms<15000){waits.push(ms);queueMicrotask(fn);}return 0;});
 let n=0;const teacher=new SubscriptionTeacher({audio:{},lesson:new VoiceLesson(),request:async()=>{if(++n===2)teacher.active=false;return {events:[{id:n,type:'thread/realtime/transcript/delta',data:{role:'assistant',delta:'말'}}]};}});teacher.active=true;
 await teacher.poll(teacher.generation);assert.ok(waits.includes(300));
});

test('client exits polling promptly after stop',async()=>{
 const calls=[];const teacher=new SubscriptionTeacher({audio:{},lesson:new VoiceLesson(),request:async(name,data)=>{calls.push(data);teacher.active=false;return {events:[]};}});
 teacher.active=true;const at=performance.now();await teacher.poll(teacher.generation);
 assert.equal(calls[0].waitMs,undefined);assert.ok(performance.now()-at<100);
});

test('recognized 13 sends concise contextual feedback instead of a long repeated solution',async()=>{
 const l=new VoiceLesson(),calls=[];
 const teacher=new SubscriptionTeacher({lesson:l,audio:{},request:async(name,data)=>{calls.push({name,data});return {};}});
 teacher.active=true;teacher.sessionId='test';
 await teacher.receive({id:1,type:'thread/realtime/transcript/done',data:{role:'user',text:'13'}});
 assert.equal(l.solved,1);assert.equal(calls.length,1);
 assert.equal(calls[0].name,'context');assert.equal(calls[0].data.feedback,'13이라고 들었어. 맞았어! 다음 문제도 해 볼까?');
 await teacher.receive({id:1,type:'thread/realtime/transcript/done',data:{role:'user',text:'13'}});
 assert.equal(calls.length,1,'duplicate poll must not speak or grade twice');
});

test('feedback acknowledges wrong/step numbers and follows only the current registered question',()=>{
 assert.equal(typeof lesson.spokenFeedback,'function');
 const l=new VoiceLesson();
 let r=lesson.dispatchText(l,'12');let s=lesson.spokenFeedback(r);assert.match(s,/12이라고 들었어/);assert.doesNotMatch(s,/13/);assert.match(s,/생각/);
 r=lesson.dispatchText(l,'모르겠어요');assert.equal(lesson.spokenFeedback(r),r.suggested_coaching);
 r=lesson.dispatchText(l,'2');assert.match(lesson.spokenFeedback(r),new RegExp(r.state.question.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 r=lesson.dispatchText(l,'전체 문제로');assert.equal(lesson.spokenFeedback(r),r.state.question);
 assert.equal(lesson.spokenFeedback(lesson.dispatchText(l,'hello@example.com')),'');
 assert.equal(lesson.spokenFeedback(lesson.dispatchText(l,'왜 더하나요?')),'');
});

test('short Korean numeric answers with conversational endings grade 13, not ignored',()=>{
 for(const text of ['13이야.','십삼이야','열셋이에요!','13 맞죠?','답은 십삼 맞아요?','13!','십삼입니다.']){
  const l=new VoiceLesson();assert.equal(lesson.dispatchText(l,text).result,'correct',text);assert.equal(l.solved,1);
 }
 for(const text of ['13 아니면 12','13 더하기 2','-13','13.5','13 아닌데','13일 수도 12일 수도'])assert.equal(lesson.parseSpokenNumber(text),null,text);
});
