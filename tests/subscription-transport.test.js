import test from 'node:test';
import assert from 'node:assert/strict';
import {SubscriptionTeacher,privateServiceURL,apiRequest} from '../realtime.js';
import {VoiceLesson} from '../lesson.js';

const turn=()=>new Promise(resolve=>setImmediate(resolve));
const transcript=(id,text)=>({id,type:'thread/realtime/transcript/done',data:{role:'user',text}});
function holdContexts(f){
 const pending=[],sent=[];const request=f.client.request;
 f.client.request=(name,data,options)=>name==='context'?new Promise((resolve,reject)=>{sent.push(data);pending.push({resolve,reject});}):request(name,data,options);
 return {pending,sent};
}
test('HTTP context errors preserve status for recoverable backpressure',async t=>{
 t.mock.method(globalThis,'fetch',async()=>({ok:false,status:429,json:async()=>({error:'Context request in progress'})}));
 await assert.rejects(apiRequest('context'),e=>e.status===429&&e.message==='Context request in progress');
});
for(const first of ['typed','transcript'])test(`${first} input shares a FIFO with overlapping typed and transcript inputs before mutation`,async t=>{
 const f=fixture();t.after(()=>f.client.stop());await f.client.start({consent:true,voice:'juniper'});const h=holdContexts(f);
 const jobs=[first==='typed'?f.client.say('건너뛰'):f.client.receive(transcript(1,'건너뛰'))];
 jobs.push(f.client.say('건너뛰'),f.client.receive(transcript(2,'건너뛰')));
 assert.equal(f.lesson.number,2);assert.equal(h.sent.length,1);
 for(let i=0;i<3;i++){assert.equal(h.sent[i].state.number,i+2);h.pending[i].resolve({});await turn();assert.equal(f.lesson.number,Math.min(i+3,4));}
 await Promise.all(jobs);assert.equal(f.client.active,true);
});
test('frontend queue bounds outstanding inputs at eight and rejects overflow before mutation',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await f.client.start({consent:true,voice:'juniper'});const h=holdContexts(f),errors=[];f.client.onError=e=>errors.push(e);
 const jobs=Array.from({length:8},()=>f.client.say('건너뛰'));
 const overflow=f.client.say('건너뛰');await turn();assert.equal(h.sent.length,1);
 assert.equal(await overflow,false);await f.client.receive(transcript(1,'건너뛰'));
 assert.equal(f.lesson.number,2);assert.equal(h.sent.length,1);assert.equal(errors.length,2);assert.equal(f.client.active,true);
 for(let i=0;i<8;i++){h.pending[i].resolve({});await turn();}
 assert.deepEqual(await Promise.all(jobs),Array(8).fill(true));assert.equal(f.lesson.number,9);
});
for(const source of ['typed','transcript'])test(`429 from ${source} rolls back and stops; retry applies skip only once`,async t=>{
 const f=fixture();t.after(()=>f.client.stop());await f.client.start({consent:true,voice:'juniper'});const before=structuredClone(f.lesson.state());const h=holdContexts(f),boards=[];f.client.onLesson=r=>boards.push(r.state);
 const first=source==='typed'?f.client.say('\uac74\ub108\ub6f0\uae30'):f.client.receive(transcript(1,'\uac74\ub108\ub6f0\uae30'));const second=f.client.say('\uac74\ub108\ub6f0\uae30');
 assert.equal(f.lesson.number,2);assert.equal(f.lesson.skipped,1);
 h.pending[0].reject(Object.assign(Error('Context rate limit'),{status:429}));await first;
 assert.equal(f.client.active,false);await second;assert.deepEqual(f.lesson.state(),before);assert.deepEqual(boards.at(-1),before);
 assert.equal(await f.client.say('\uac74\ub108\ub6f0\uae30'),false);assert.equal(h.sent.length,1);assert.equal(f.stopped(),1);
 await f.client.start({consent:true,voice:'juniper'});const retry=f.client.say('\uac74\ub108\ub6f0\uae30');h.pending[1].resolve({});assert.equal(await retry,true);
 assert.equal(f.lesson.number,2);assert.equal(f.lesson.skipped,1);
});
for(const late of ['resolve','reject'])test(`stop cancels queued inputs and stale ${late} cannot drain or unlock a new generation`,async t=>{
 const f=fixture();t.after(()=>f.client.stop());await f.client.start({consent:true,voice:'juniper'});const h=holdContexts(f);
 const old=[f.client.say('건너뛰'),f.client.say('건너뛰'),f.client.receive(transcript(1,'그만'))];
 await f.client.stop();f.client.lesson=new VoiceLesson();await f.client.start({consent:true,voice:'juniper'});
 const fresh=f.client.say('건너뛰'),queued=f.client.say('건너뛰');
 h.pending[0][late](late==='reject'?Error('late'):{});await Promise.all(old);await turn();
 assert.equal(f.client.lesson.number,2);assert.equal(h.sent.length,2);assert.equal(f.client.active,true);
 h.pending[1].resolve({});await fresh;await turn();assert.equal(h.sent.length,3);assert.equal(f.client.lesson.number,3);
 h.pending[2].resolve({});assert.equal(await queued,true);
});
test('fatal context failure discards queued lesson mutations',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await f.client.start({consent:true,voice:'juniper'});const h=holdContexts(f);
 const jobs=[f.client.say('건너뛰'),f.client.say('건너뛰')];h.pending[0].reject(Error('offline'));await Promise.all(jobs);
 assert.equal(f.client.active,false);assert.equal(f.lesson.number,2);assert.equal(h.sent.length,1);
});
test('private URL must be HTTPS with no credentials, query or fragment',()=>{
 for(const url of ['http://example.com','https://user:pass@example.com','javascript:alert(1)','https://example.com/?token=x','https://example.com/#x'])assert.throws(()=>privateServiceURL(url));
 assert.equal(privateServiceURL('https://teacher.example.com'),'https://teacher.example.com/');
});
test('aborted heartbeat and repeated stop do not abort cleanup',async t=>{
 const f=fixture();t.after(()=>f.client.stop());let heartbeat,finish,signal;
 t.mock.method(globalThis,'setInterval',(fn,ms)=>{if(ms===5000)heartbeat=fn;return 0;});
 const request=f.client.request;f.client.request=(name,data,options)=>{
  if(name==='heartbeat')return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted'))));
  if(name==='stop'){signal=options.signal;return new Promise(r=>finish=r);}return request(name,data,options);
 };
 await f.client.start({consent:true,voice:'juniper'});heartbeat();const stopping=f.client.stop();const repeated=f.client.stop();
 await new Promise(r=>setImmediate(r));const aborted=signal.aborted;finish({});await Promise.all([stopping,repeated]);assert.equal(aborted,false);
});

test('stop is idempotent even when cleanup callbacks synchronously call stop',async()=>{
 const f=fixture();await f.client.start({consent:true,voice:'juniper'});
 let nested,notifications=0;
 f.client.onState=state=>{if(state==='stopped'&&++notifications===1)nested=f.client.stop();};
 const generation=f.client.generation;const stopping=f.client.stop();await stopping;
 assert.equal(nested,stopping);assert.equal(notifications,1);assert.equal(f.client.generation,generation+1);
 assert.equal(f.requests.filter(([name])=>name==='stop').length,1);
});
test('stale heartbeat and typed-context failures cannot stop a new session',async t=>{
 const f=fixture();t.after(()=>f.client.stop());let heartbeat,rejectBeat,rejectContext;
 t.mock.method(globalThis,'setInterval',(fn,ms)=>{if(ms===5000)heartbeat=fn;return 0;});
 const request=f.client.request;f.client.request=(name,data,options)=>name==='heartbeat'?new Promise((_,r)=>rejectBeat=r):name==='context'?new Promise((_,r)=>rejectContext=r):request(name,data,options);
 await f.client.start({consent:true,voice:'juniper'});heartbeat();const saying=f.client.say('hint');await f.client.stop();await f.client.start({consent:true,voice:'juniper'});
 rejectBeat(Error('late'));rejectContext(Error('late'));await saying;await new Promise(r=>setImmediate(r));assert.equal(f.client.active,true);
});
test('playback blockage persists through transcripts until successful unlock or stop',async t=>{
 const f=fixture();t.after(()=>f.client.stop());await f.client.start({consent:true,voice:'juniper'});
 f.client.audio.play=async()=>{throw Error('autoplay');};f.client.pc.ontrack({streams:[{}]});await new Promise(r=>setImmediate(r));
 for(const [id,type] of [[1,'delta'],[2,'done']])await f.client.receive({id,type:'thread/realtime/transcript/'+type,data:{role:'assistant',text:'hello',delta:'hello'}});
 assert.equal(f.client.playbackBlocked,true);await assert.rejects(()=>f.client.unlockAudio());assert.equal(f.client.playbackBlocked,true);
 f.client.audio.play=async()=>{};await f.client.unlockAudio();assert.equal(f.client.playbackBlocked,false);await f.client.stop();assert.equal(f.client.playbackBlocked,false);
});
function fixture(){let mic=0,stopped=0,closed=0;const requests=[],states=[];const track={enabled:true,stop(){stopped++;},addEventListener(){}};const stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
 class Peer{constructor(){this.iceGatheringState='complete';}addTrack(){}createDataChannel(){return {close(){}};}async createOffer(){return {type:'offer',sdp:'v=0 offer'};}async setLocalDescription(d){this.localDescription=d;}async setRemoteDescription(d){this.remoteDescription=d;}close(){closed++;}}
 const request=async(name,data)=>{requests.push([name,data]);if(name==='catalog')return {accountType:'chatgpt',voices:['juniper'],defaultVoice:'juniper'};if(name==='start')return {sessionId:data.sessionId,sdp:'v=0 answer'};if(name==='events')return {events:[],cursor:0};return {active:true};};
 const lesson=new VoiceLesson();const client=new SubscriptionTeacher({audio:{pause(){},play:async()=>{},srcObject:null},lesson,onState:s=>states.push(s),request,getUserMedia:async()=>{mic++;return stream;},Peer});return {client,lesson,requests,states,track,mic:()=>mic,stopped:()=>stopped,closed:()=>closed};}
test('consent and successful ChatGPT auth precede microphone; start and stop clean resources',async()=>{
 const f=fixture();await assert.rejects(()=>f.client.start({consent:false,voice:'juniper'}));assert.equal(f.mic(),0);
 const original=f.client.request;f.client.request=async()=>{throw Error('Unauthorized');};await assert.rejects(()=>f.client.start({consent:true,voice:'juniper'}));assert.equal(f.mic(),0);
 f.client.request=original;await f.client.start({consent:true,voice:'juniper'});assert.equal(f.mic(),1);assert.equal(f.client.pc.remoteDescription.sdp,'v=0 answer');await f.client.stop();assert.equal(f.stopped(),1);assert.equal(f.closed(),1);assert.equal(f.client.active,false);
});
test('official user transcript done alone drives lesson; duplicate polling ignored; typed input is context only',async()=>{
 const f=fixture();await f.client.start({consent:true,voice:'juniper'});
 const event=(id,role,text)=>({id,type:'thread/realtime/transcript/done',data:{role,text}});
 await f.client.receive(event(1,'assistant','13'));assert.equal(f.lesson.solved,0);
 await f.client.receive(event(2,'user','모르겠어요'));assert.equal(f.lesson.s.micro,true);
 await f.client.receive(event(3,'user','2요'));await f.client.receive(event(3,'user','2요'));assert.equal(f.lesson.s.step,1);
 await f.client.say('3요');assert.equal(f.lesson.s.micro,false);assert.ok(f.requests.some(([m])=>m==='context'));
 await f.client.receive(event(4,'user','그만할래'));assert.equal(f.client.active,false);assert.equal(f.stopped(),1);
});
test('late microphone permission after cancellation is stopped and cannot open a session',async()=>{
 const f=fixture();let resolve;f.client.getUserMedia=()=>new Promise(r=>resolve=r);const pending=f.client.start({consent:true,voice:'juniper'});await new Promise(r=>setImmediate(r));await f.client.stop();let stopped=0;resolve({getTracks:()=>[{stop(){stopped++;}}]});await pending;assert.equal(stopped,1);assert.ok(!f.requests.some(([m])=>m==='start'));
});
