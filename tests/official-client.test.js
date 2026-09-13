import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {OfficialClient,safeEnvironment,processArgs} from '../official-client.mjs';
test('process security removes API environment and disables execution',()=>{
 const env=safeEnvironment({PATH:'ok',OPENAI_API_KEY:'secret',CODEX_API_KEY:'secret',OPENAI_BASE_URL:'bad',AZURE_OPENAI_API_KEY:'bad'});
 assert.deepEqual(env,{PATH:'ok'});const args=processArgs();assert.ok(args.includes('mcp_servers={}'));assert.ok(args.includes('features.shell_tool=false'));assert.ok(args.includes('features.realtime_conversation=true'));
});
test('RPC backpressure rejects excess, resumes on drain and bounds pending count and bytes',async()=>{
 const c=new OfficialClient({timeout:1000});const stdin=new EventEmitter();let writes=0;
 stdin.writable=true;stdin.write=()=>{writes++;return false;};c.proc={stdin,exitCode:null};
 const first=c.rpc('account/read',{}).catch(()=>{});
 try{
  await assert.rejects(c.rpc('account/read',{}),/backpressure|limit/i);assert.equal(writes,1);
  stdin.emit('drain');stdin.write=()=>{writes++;return true;};
  await assert.rejects(c.rpc('thread/realtime/appendText',{text:'x'.repeat(300000)}),/limit/i);
  const pending=Array.from({length:1000},()=>c.rpc('account/read',{}).catch(()=>{}));
  assert.ok(c.pending.size<=32);assert.ok(writes<=32);c.fail();await Promise.all(pending);
 }finally{c.fail();await first;}
});
test('close reports false when process exit was not observed',async()=>{
 const c=new OfficialClient();c.proc=new EventEmitter();c.proc.exitCode=null;c.proc.stdin={end(){}};c.proc.kill=()=>false;
 assert.equal(await c.close(),false);
});
test('backpressure while denying a provider request closes safely without throwing',async()=>{
 const c=new OfficialClient({bin:process.execPath,args:['tests/fixtures/app-server.mjs'],timeout:1000});
 try{await c.open();c.blocked=true;assert.doesNotThrow(()=>c.proc.stdout.emit('data',JSON.stringify({id:99,method:'tool/call'})+'\n'));assert.equal(c.closing,true);}finally{await c.close();}
});
test('real child process JSON-RPC execution, initialize and close (fixture, no provider)',async()=>{
 const c=new OfficialClient({bin:process.execPath,args:['tests/fixtures/app-server.mjs'],timeout:1000});
 try{await c.open();assert.deepEqual(await c.rpc('account/read',{refreshToken:false}),{account:{type:'chatgpt'}});const r=await c.rpc('thread/realtime/listVoices',{});assert.equal(r.voices.defaultV1,'juniper');await assert.rejects(()=>c.rpc('turn/start',{}),/not allowed/);}finally{await c.close();}assert.notEqual(c.proc.exitCode,null);
});

test('failed close retains owned child and safely recognizes its later exit',async()=>{
 const c=new OfficialClient(),proc=new EventEmitter();let kills=0;
 proc.exitCode=null;proc.signalCode=null;proc.stdin={end(){}};proc.kill=()=>{kills++;return false;};c.proc=proc;
 assert.equal(await c.close(),false);assert.equal(c.proc,proc);
 assert.equal(await c.close(),false);assert.equal(kills,1);
 proc.exitCode=0;proc.emit('exit',0,null);
 assert.equal(await c.close(),true);assert.equal(kills,1);
});
