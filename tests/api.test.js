import test from 'node:test';
import assert from 'node:assert/strict';
import {TutorAPI,MODELS} from '../api.js';
import {buildProblem,newProgress} from '../engine.js';
const TEST_KEY='sk-proj-DUMMY_ONLY_NEVER_A_REAL_KEY_0000';
const response=body=>new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
test('key is private and clear disables requests',()=>{const api=new TutorAPI();assert.throws(()=>api.connect('bad'));api.connect(TEST_KEY);assert.equal(api.connected,true);assert.ok(!JSON.stringify(api).includes(TEST_KEY));api.clear();assert.equal(api.connected,false);});
test('coach sends store:false, bounded schema, no final answer; returns allowed action only',async()=>{
 const prev=globalThis.fetch;let seen;
 globalThis.fetch=async(url,opts)=>{seen={url,opts,body:JSON.parse(opts.body)};return response({output:[{content:[{type:'output_text',text:'{"action":"micro_step","focus":"unsure"}'}]}]});};
 try{const api=new TutorAPI();api.connect(TEST_KEY);const d=await api.decide(buildProblem('add',8,5),newProgress(),'わからない');assert.equal(d.action,'micro_step');assert.equal(seen.body.model,MODELS.coach);assert.equal(seen.body.store,false);assert.equal(seen.body.text.format.strict,true);assert.equal(seen.body.max_output_tokens,120);assert.equal(seen.opts.credentials,'omit');assert.ok(!seen.body.input.includes('13'));assert.ok(!seen.url.includes(TEST_KEY));assert.equal(api.requests,1);}finally{globalThis.fetch=prev;}
});
test('model prose, refusal and extra answer fields are never rendered as successful decisions',async()=>{
 const prev=globalThis.fetch;try{for(const text of ['정답은 13','{"action":"hint","focus":"unsure","answer":13}','{}']){globalThis.fetch=async()=>response({output:[{content:[{type:'output_text',text}]}]});const api=new TutorAPI();api.connect(TEST_KEY);await assert.rejects(()=>api.decide(buildProblem('add',8,5),newProgress(),'힌트'));}}finally{globalThis.fetch=prev;}
});
test('API status codes have safe messages and never echo server secrets',async()=>{
 const prev=globalThis.fetch;try{for(const status of [400,401,403,404,429,500]){globalThis.fetch=async()=>new Response(JSON.stringify({error:{code:status===429?'insufficient_quota':'x',message:TEST_KEY}}),{status});const api=new TutorAPI();api.connect(TEST_KEY);await assert.rejects(()=>api.decide(buildProblem('add',8,5),newProgress(),'힌트'),e=>e.status===status&&!e.message.includes(TEST_KEY));}}finally{globalThis.fetch=prev;}
});
test('sensitive text is blocked before fetch',async()=>{const prev=globalThis.fetch;let called=false;globalThis.fetch=async()=>{called=true;return response({});};try{const api=new TutorAPI();api.connect(TEST_KEY);await assert.rejects(()=>api.decide(buildProblem('add',8,5),newProgress(),'01012345678'));assert.equal(called,false);}finally{globalThis.fetch=prev;}});
test('speech uses controlled input and no unapproved endpoint',async()=>{const prev=globalThis.fetch;let seen;globalThis.fetch=async(url,opts)=>{seen={url,body:JSON.parse(opts.body)};return new Response(new Blob(['fakeaudio'],{type:'audio/mpeg'}));};try{const api=new TutorAPI();api.connect(TEST_KEY);await api.speak('어디까지 생각했어?');assert.equal(seen.url,'https://api.openai.com/v1/audio/speech');assert.equal(seen.body.input,'어디까지 생각했어?');assert.equal(seen.body.model,MODELS.speech);assert.equal(seen.body.voice,'coral');await assert.rejects(()=>api.speak('가'.repeat(601)));}finally{globalThis.fetch=prev;}});
test('transcription uses browser recording MIME-aware filename',async()=>{const prev=globalThis.fetch;let form;globalThis.fetch=async(url,opts)=>{form=opts.body;return response({text:'십삼이요'});};try{const api=new TutorAPI();api.connect(TEST_KEY);const text=await api.transcribe(new Blob(['x'.repeat(300)],{type:'audio/mp4'}));assert.equal(text,'십삼이요');assert.equal(form.get('file').name,'thought.mp4');assert.equal(form.get('language'),'ko');await assert.rejects(()=>api.transcribe(new Blob(['x'])));}finally{globalThis.fetch=prev;}});
test('session request cap prevents uncontrolled loops and no auto retry',async()=>{const prev=globalThis.fetch;let n=0;globalThis.fetch=async()=>{n++;return response({});};try{const api=new TutorAPI();api.connect(TEST_KEY);for(let i=0;i<120;i++)await api.request('/responses',{});await assert.rejects(()=>api.request('/responses',{}));assert.equal(n,120);}finally{globalThis.fetch=prev;}});
