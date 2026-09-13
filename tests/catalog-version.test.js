import test from 'node:test';import assert from 'node:assert/strict';import {createVoiceServer} from '../server.mjs';
test('realtime v3 uses official v1 catalog, never v2 marin',async t=>{
 const client={async open(){},async close(){return true;},async rpc(method){if(method==='account/read')return {account:{type:'chatgpt'}};if(method==='thread/realtime/listVoices')return {voices:{v1:['juniper','cove'],v2:['marin','cedar'],defaultV1:'cove',defaultV2:'marin'}};throw Error('Unexpected live RPC');}};
 const app=createVoiceServer({port:0,clientFactory:()=>client});await app.listen();t.after(()=>app.close());
 const page=await fetch(app.origin);const cookie=page.headers.get('set-cookie').split(';')[0];
 const response=await fetch(app.origin+'/api/catalog',{method:'POST',headers:{cookie,origin:app.origin,'x-voice-request':'1','content-type':'application/json'},body:'{}'});assert.equal(response.status,200);const result=await response.json();
 assert.deepEqual(result.voices,['juniper','cove']);assert.equal(result.defaultVoice,'juniper');
});
