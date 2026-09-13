import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SubscriptionTeacher} from '../realtime.js';
test('default UI preserves board and loads only subscription controls',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');const js=await readFile(new URL('../live.js',import.meta.url),'utf8');
 for(const id of ['equation','visual','avatar','voice','consent','privateURL','accountStatus'])assert.ok(html.includes(`id="${id}"`),id);
 assert.doesNotMatch(html,/id="apiKey"|id="model"|api.openai.com|20분/);assert.doesNotMatch(js,/apiKey|sessionConfig|LIVE_MODEL/);
 assert.match(js,/SubscriptionTeacher/);assert.match(js,/location.assign/);assert.match(html,/음성 응답.*보장/);
});
test('controller executes setup/catalog, consent gate, private navigation and board render without a microphone',async t=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 class Element{constructor(){this.handlers={};this.children=[];this.value='';this.checked=false;}addEventListener(n,fn){this.handlers[n]=fn;}append(...v){this.children.push(...v);}replaceChildren(...v){this.children=v;}setAttribute(){}showModal(){this.open=true;}close(){this.open=false;}pause(){}async play(){}}
 const els=Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element()]));const doc={getElementById:id=>els[id],createElement:()=>new Element(),createTextNode:text=>text,body:{},addEventListener(){}};
 const restore=[];for(const [key,value] of Object.entries({document:doc,window:{addEventListener(){}},location:{origin:'http://127.0.0.1:8775',assign:url=>{els.privateURL.destination=url;}}})){restore.push([key,Object.getOwnPropertyDescriptor(globalThis,key)]);Object.defineProperty(globalThis,key,{value,configurable:true});}
 t.after(()=>{for(const [key,d] of restore){if(d)Object.defineProperty(globalThis,key,d);else delete globalThis[key];}});
 t.mock.method(globalThis,'setInterval',()=>0);
 let requests=0;t.mock.method(globalThis,'fetch',async(url)=>{requests++;assert.equal(url,'/api/catalog');return new Response(JSON.stringify({accountType:'chatgpt',voices:['juniper','cove'],defaultVoice:'juniper'}));});
 let client;const catalog=SubscriptionTeacher.prototype.catalog;t.mock.method(SubscriptionTeacher.prototype,'catalog',function(){client=this;return catalog.call(this);});
 await import('../live.js');await new Promise(r=>setImmediate(r));
 assert.equal(els.equation.children[0],'8 + 5 = ');assert.equal(els.voice.value,'juniper');assert.equal(els.setup.open,true);assert.equal(els.connect.disabled,false);assert.equal(requests,1);
 await els.connect.handlers.click();assert.match(els.setupError.textContent,/성인/);assert.equal(requests,1);
 els.privateURL.value='https://private.example/';els.openPrivate.handlers.click();assert.equal(els.privateURL.destination,'https://private.example/');
 els.preview.handlers.click();assert.equal(els.setup.open,false);
 client.active=true;els.audio.play=async()=>{throw Error('blocked');};await assert.rejects(()=>client.unlockAudio());assert.equal(els.unlock.hidden,false);
 for(const [id,type] of [[1,'delta'],[2,'done']]){await client.receive({id,type:'thread/realtime/transcript/'+type,data:{role:'assistant',text:'hello',delta:'hello'}});assert.equal(els.unlock.hidden,false);}
 els.audio.play=async()=>{};await els.unlock.handlers.click();assert.equal(els.unlock.hidden,true);
 els.audio.play=async()=>{throw Error('blocked');};await assert.rejects(()=>client.unlockAudio());await client.stop();assert.equal(els.unlock.hidden,true);
});
