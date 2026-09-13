import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createVoiceServer} from '../server.mjs';
import {VoiceLesson} from '../lesson.js';
class FakeClient{
 constructor(){this.calls=[];this.closed=false;}
 async open(){this.calls.push(['initialize']);}
 async rpc(m,p){this.calls.push([m,p]);if(m==='account/read')return {account:{type:this.accountType||'chatgpt'}};if(m==='thread/realtime/listVoices')return {voices:{v1:['juniper','cove'],defaultV1:'juniper'}};if(m==='thread/start')return {thread:{id:'t1'},modelProvider:'openai'};if(m==='thread/realtime/start')this.onEvent({method:'thread/realtime/sdp',params:{threadId:'t1',sdp:'v=0\r\nanswer'}});return {};}
 async close(){this.closed=true;return true;}
}
async function fixture(t){let now=1000;const clients=[];const app=createVoiceServer({port:0,now:()=>now,clientFactory:()=>{const c=new FakeClient();clients.push(c);return c;}});await app.listen();t.after(()=>app.close());const base=app.origin;const page=await fetch(base);const cookie=page.headers.get('set-cookie').split(';')[0];
 const post=(route,data={},headers={})=>fetch(base+'/api/'+route,{method:'POST',headers:{cookie,origin:base,'x-voice-request':'1','content-type':'application/json',...headers},body:JSON.stringify(data)});
 return {app,base,cookie,post,clients,advance:n=>{now+=n;},page};}
test('idle has no child; catalog requires cookie + exact host/origin/header and closes child',async t=>{
 const f=await fixture(t);assert.equal(f.clients.length,0);assert.match(f.page.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
 for(const headers of [{cookie:''},{origin:'https://evil.test'},{'x-voice-request':''},{'sec-fetch-site':'cross-site'}])assert.equal((await f.post('catalog',{},headers)).status,403,JSON.stringify(headers));
 assert.equal(await new Promise(resolve=>{http.get(f.base,{headers:{host:'localhost'}},r=>{r.resume();resolve(r.statusCode);});}),403);
 assert.equal(f.clients.length,0);const r=await f.post('catalog');assert.equal(r.status,200);assert.equal((await r.json()).defaultVoice,'juniper');assert.ok(f.clients[0].closed);
 for(const path of ['/server.mjs','/.env','/tests/server.test.js','/package.json'])assert.equal((await fetch(f.base+path)).status,404);
});
test('status is protected, owner-scoped and exposes only cleanup booleans',async t=>{
 const f=await fixture(t);
 for(const h of [{cookie:''},{origin:''},{origin:'https://evil.test'},{'x-voice-request':''},{'sec-fetch-site':'cross-site'}])assert.equal((await f.post('status',{},h)).status,403);
 assert.deepEqual(await (await f.post('status')).json(),{active:false,lastStop:null});assert.equal(f.clients.length,0);
 const {sessionId}=await (await f.post('start',{consent:true,voice:'juniper',sdp:'v=0 offer',state:new VoiceLesson().state()})).json();
 const other=(await fetch(f.base)).headers.get('set-cookie').split(';')[0];assert.equal((await f.post('status',{}, {cookie:other})).status,403);
 f.clients[0].close=async()=>false;
 const stopped=await (await f.post('stop',{sessionId})).json();assert.equal(stopped.acknowledged,true);assert.equal(stopped.exited,false);
 assert.deepEqual(await (await f.post('status')).json(),{active:true,lastStop:{acknowledged:true,exited:false}});
 assert.equal((await f.post('status',{}, {cookie:other})).status,403);
});
test('context concurrency and rate are bounded without stopping the session',async t=>{
 const f=await fixture(t);const {sessionId}=await (await f.post('start',{consent:true,voice:'juniper',sdp:'v=0 offer',state:new VoiceLesson().state()})).json();
 const c=f.clients[0],rpc=c.rpc.bind(c);let release;const releases=[];
 c.rpc=(m,p)=>m==='thread/realtime/appendText'?new Promise(r=>{release=r;releases.push(r);}):rpc(m,p);
 const data={sessionId,state:new VoiceLesson().state()};const pending=f.post('context',data);
 while(!release)await new Promise(r=>setTimeout(r,5));
 let excess;try{excess=await Promise.race([f.post('context',data),new Promise(r=>setTimeout(()=>r({status:0}),100))]);}finally{releases.forEach(r=>r({}));c.rpc=rpc;}
 assert.equal(excess.status,429);assert.equal((await pending).status,200);assert.ok(f.app.active);
 let limited=false;for(let i=0;i<30;i++)if((await f.post('context',data)).status===429)limited=true;
 assert.ok(limited);f.advance(10001);assert.equal((await f.post('context',data)).status,200);
});
test('catalog response waits for child cleanup so immediate connect is not rejected',async t=>{
 const f=await fixture(t);const factory=f.app.clientFactory;
 f.app.clientFactory=()=>{const c=factory();c.close=async()=>{await new Promise(r=>setTimeout(r,100));c.closed=true;return true;};return c;};
 const first=await f.post('catalog');assert.equal(first.status,200);
 assert.ok(f.clients[0].closed,'catalog must finish cleanup before enabling connect');
 assert.equal((await f.post('catalog')).status,200);
});
test('protected status reports real stop acknowledgement, including rejected stop',async t=>{
 const f=await fixture(t);assert.equal((await f.post('status',{}, {cookie:''})).status,403);
 let r=await f.post('start',{consent:true,voice:'juniper',sdp:'v=0 offer',state:new VoiceLesson().state()});let {sessionId}=await r.json();
 assert.equal((await (await f.post('status')).json()).active,true);
 let ended=await (await f.post('stop',{sessionId})).json();assert.equal(ended.acknowledged,true);
 let status=await (await f.post('status')).json();assert.equal(status.active,false);assert.equal(status.lastStop.acknowledged,true);
 r=await f.post('start',{consent:true,voice:'juniper',sdp:'v=0 offer',state:new VoiceLesson().state()});({sessionId}=await r.json());
 const c=f.clients.at(-1),rpc=c.rpc.bind(c);c.rpc=(m,p)=>m==='thread/realtime/stop'?Promise.reject(Error('denied')):rpc(m,p);
 ended=await (await f.post('stop',{sessionId})).json();assert.equal(ended.acknowledged,false);assert.ok(c.closed);
 assert.deepEqual(await (await f.post('status')).json(),{active:false,lastStop:{acknowledged:false,exited:true}});
});
test('owned start, official voice/SDP, contextual append, polling, stop',async t=>{
 const f=await fixture(t);const r=await f.post('start',{consent:true,voice:'juniper',sdp:'v=0\r\noffer',state:new VoiceLesson().state()});assert.equal(r.status,200);const {sessionId,sdp}=await r.json();assert.match(sdp,/answer/);
 const c=f.clients[0],start=c.calls.find(([m])=>m==='thread/realtime/start')[1];assert.equal(start.version,'v3');assert.equal(start.voice,'juniper');assert.equal(start.clientManagedHandoffs,false);assert.equal(start.includeStartupContext,false);assert.equal(start.outputModality,'audio');
 assert.equal((await f.post('stop',{sessionId:'wrong'})).status,403);
 c.onEvent({method:'thread/realtime/transcript/done',params:{threadId:'t1',role:'user',text:'13이요'}});
 const events=await (await f.post('events',{sessionId,after:0})).json();assert.equal(events.events[0].data.text,'13이요');
 assert.equal((await f.post('context',{sessionId,state:new VoiceLesson().state()})).status,200);assert.ok(c.calls.some(([m,p])=>m==='thread/realtime/appendText'&&p.role==='user'));
 assert.equal((await f.post('rpc',{method:'turn/start'})).status,404);
 await f.post('stop',{sessionId});assert.ok(c.closed);assert.equal(f.app.active,null);
});
test('heartbeat, maximum age, validation and account failure cleanup',async t=>{
 const f=await fixture(t);const start=()=>f.post('start',{consent:true,voice:'juniper',sdp:'v=0\r\noffer',state:new VoiceLesson().state()});
 assert.equal((await f.post('start',{})).status,400);assert.equal(f.clients.length,0);
 let r=await start();let {sessionId}=await r.json();f.advance(20001);await f.app.sweep();assert.equal(f.app.active,null);assert.ok(f.clients[0].closed);
 r=await start();({sessionId}=await r.json());f.advance(600001);await f.post('heartbeat',{sessionId});await f.app.sweep();assert.equal(f.app.active,null);
 const original=f.app.clientFactory;f.app.clientFactory=()=>{const c=original();c.accountType='apiKey';return c;};assert.equal((await start()).status,401);assert.ok(f.clients.at(-1).closed);assert.equal(f.app.active,null);
 assert.equal((await f.post('catalog',{text:'x'.repeat(70000)})).status,413);
});
test('typed context retains protected learner text; private values rejected before append',async t=>{
 const f=await fixture(t);const r=await f.post('start',{consent:true,voice:'juniper',sdp:'v=0 offer',state:new VoiceLesson().state()});const {sessionId}=await r.json();
 await f.post('context',{sessionId,state:new VoiceLesson().state(),text:'왜 더해요?'});
 assert.match(f.clients[0].calls.at(-1)[1].text,/왜 더해요/);
 const n=f.clients[0].calls.length;assert.equal((await f.post('context',{sessionId,state:new VoiceLesson().state(),text:'hello@example.com'})).status,400);assert.equal(f.clients[0].calls.length,n);
});
test('second browser cannot poll, heartbeat, append or stop owner session',async t=>{
 const f=await fixture(t);const {sessionId}=await (await f.post('start',{consent:true,voice:'juniper',sdp:'v=0 offer',state:new VoiceLesson().state()})).json();
 const other=(await fetch(f.base)).headers.get('set-cookie').split(';')[0];
 for(const route of ['events','heartbeat','context','stop'])assert.equal((await f.post(route,{sessionId,after:0,state:new VoiceLesson().state()},{cookie:other})).status,403);
 assert.ok(f.app.active);f.advance(120001);f.app.active.last=121001;await f.app.sweep();assert.equal(f.app.active,null);
});
test('cancel a start awaiting SDP, and realtime errors close the child',async t=>{
 const f=await fixture(t);const factory=f.app.clientFactory;f.app.clientFactory=()=>{const c=factory();const rpc=c.rpc.bind(c);c.rpc=async(m,p)=>m==='thread/realtime/start'?{}:rpc(m,p);return c;};
 const sessionId='a'.repeat(48);const pending=f.post('start',{sessionId,consent:true,voice:'juniper',sdp:'v=0 offer',state:new VoiceLesson().state()});
 while(!f.app.active?.realtime)await new Promise(r=>setTimeout(r,5));
 assert.equal((await f.post('heartbeat',{sessionId})).status,200);
 await f.post('stop',{sessionId});assert.equal((await pending).status,409);assert.ok(f.clients[0].closed);
 f.app.clientFactory=factory;await f.post('start',{consent:true,voice:'juniper',sdp:'v=0 offer',state:new VoiceLesson().state()});f.clients.at(-1).onEvent({method:'thread/realtime/error',params:{threadId:'t1',message:'secret'}});await f.app.sweep();await new Promise(r=>setImmediate(r));assert.equal(f.app.active,null);
});
test('server shutdown closes an in-progress catalog probe',async t=>{
 const f=await fixture(t);const factory=f.app.clientFactory;let release;
 f.app.clientFactory=()=>{const c=factory();c.open=()=>new Promise(r=>release=r);return c;};
 const pending=f.post('catalog');while(!release)await new Promise(r=>setTimeout(r,5));
 const closing=f.app.close();await new Promise(r=>setImmediate(r));const closed=f.clients[0].closed;release();await pending;await closing;assert.ok(closed);
});

test('unconfirmed stop retains tracking and blocks catalog/start until exit recheck',async t=>{
 const f=await fixture(t),data={consent:true,voice:'juniper',sdp:'v=0 offer',state:new VoiceLesson().state()};
 const {sessionId}=await (await f.post('start',data)).json();const c=f.clients[0];let exited=false;
 c.close=async()=>exited;const rpc=c.rpc.bind(c);c.rpc=(m,p)=>m==='thread/realtime/stop'?Promise.reject(Error('denied')):rpc(m,p);
 const r=await f.post('stop',{sessionId});assert.equal(r.status,502);
 assert.deepEqual(await r.json(),{stopped:false,acknowledged:false,exited:false});assert.equal(f.app.active.client,c);
 for(const route of ['catalog','start'])assert.equal((await f.post(route,data)).status,409);
 assert.equal(f.clients.length,1);assert.equal((await f.post('context',{sessionId,state:data.state})).status,410);
 exited=true;assert.equal((await f.post('stop',{sessionId})).status,200);assert.equal(f.app.active,null);
 assert.equal((await f.post('start',data)).status,200);
});
for(const throws of [false,true])test('failed catalog cleanup holds lock until owned probe exit: throws='+throws,async t=>{
 const f=await fixture(t),factory=f.app.clientFactory;let exited=false;
 f.app.clientFactory=()=>{const c=factory();c.close=async()=>{if(throws&&!exited)throw Error('close failed');return exited;};return c;};
 assert.equal((await f.post('catalog')).status,502);
 for(const route of ['catalog','start'])assert.equal((await f.post(route,{})).status,409);
 assert.equal(f.clients.length,1);exited=true;f.app.clientFactory=factory;
 assert.equal((await f.post('catalog')).status,200);assert.equal(f.clients.length,2);
});
