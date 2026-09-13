import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {OfficialClient,repoDir} from './official-client.mjs';
import {sanitizeState,teacherPrompt} from './subscription-lesson.js';
import {protectInput} from './engine.js';
const files=new Set(['index.html','live.js','live.css','realtime.js','lesson.js','engine.js','subscription-lesson.js','runtime-config.js','favicon.svg','legacy.html','app.js','api.js','style.css']);
const token=()=>randomBytes(24).toString('hex');
const error=(status,message)=>Object.assign(Error(message),{status});
async function body(req){
 let n=0;const chunks=[];for await(const chunk of req){n+=chunk.length;if(n>65536)throw error(413,'Request too large');chunks.push(chunk);}
 try{const data=JSON.parse(Buffer.concat(chunks).toString()||'{}');if(!data||Array.isArray(data)||typeof data!=='object')throw Error();return data;}catch{throw error(400,'Invalid JSON');}
}
export function createVoiceServer({port=Number(process.env.PORT||8775),now=Date.now,clientFactory=()=>new OfficialClient()}={}){
 const owners=new Map();let busy=false;let sweepTimer,probe;
 const app={active:null,clientFactory,origin:`http://127.0.0.1:${port}`};
 async function closeClient(c){try{return (await c.close())===true;}catch{return false;}}
 async function clearProbe(){const c=probe;if(!c)return true;const exited=await closeClient(c);if(exited&&probe===c)probe=null;return exited;}
 async function stop(s=app.active){
  if(!s)return;if(s.stopping)return s.stopping;s.cancelled=true;
  const cleanup=(async()=>{
   let acknowledged=s.stopResult?.acknowledged||false;
   try{if(!s.stopResult&&s.tid&&s.realtime){await Promise.race([s.client.rpc('thread/realtime/stop',{threadId:s.tid}),new Promise((_,reject)=>{s.stopTimer=setTimeout(()=>reject(Error()),5000);})]);acknowledged=true;}}catch{}finally{clearTimeout(s.stopTimer);}
   const exited=await closeClient(s.client);s.events=[];s.stopResult={acknowledged,exited};
   const owner=owners.get(s.owner);if(owner)owner.lastStop=s.stopResult;
   if(exited&&app.active===s)app.active=null;
   return s.stopResult;
  })();s.stopping=cleanup;
  try{return await cleanup;}finally{if(s.stopping===cleanup)s.stopping=null;}
 }
 async function authenticate(c){await c.open();const a=await c.rpc('account/read',{refreshToken:false});if(a.account?.type!=='chatgpt')throw error(401,'Official Codex ChatGPT login required; no API fallback');}
 async function catalog(c){const r=await c.rpc('thread/realtime/listVoices',{});const voices=r.voices?.v1;if(!Array.isArray(voices)||!voices.length||voices.length>100||!voices.every(v=>typeof v==='string'&&/^[a-z0-9_-]{1,40}$/.test(v)))throw error(502,'Unsupported voice catalog');const defaultVoice=voices.includes('juniper')?'juniper':r.voices.defaultV1;if(!voices.includes(defaultVoice))throw error(502,'Invalid catalog default');return {voices,defaultVoice,accountType:'chatgpt'};}
 app.sweep=async()=>{if(probe&&!busy)await clearProbe();const s=app.active;if(s&&(s.cancelled||now()-s.last>20000||now()-s.born>600000||now()-s.activity>120000))await stop(s);for(const [id,c] of owners)if(now()-c.created>3600000&&app.active?.owner!==id)owners.delete(id);};
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; media-src 'self' blob:; img-src 'self' data:; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'none'");
  const out=(status,data)=>{if(!res.destroyed){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}};
  try{
   if(req.headers.host!==new URL(app.origin).host||req.headers['sec-fetch-site']==='cross-site')throw error(403,'Invalid host or site');
   if(req.headers.origin&&req.headers.origin!==app.origin)throw error(403,'Invalid origin');
   const url=new URL(req.url,app.origin);let owner=/(?:^|;\s*)voice_session=([a-f0-9]{48})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
   if(req.method==='GET'){
    const file=url.pathname==='/'?'index.html':url.pathname.slice(1);if(!files.has(file))return out(404,{error:'Not found'});
    if(file==='legacy.html')res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://api.openai.com; media-src 'self' blob:; img-src 'self' data:; frame-ancestors 'none'; object-src 'none'; base-uri 'none'");
    if(file==='index.html'){if(!owners.has(owner)){if(owners.size>=256)throw error(429,'Too many browser sessions');owner=token();owners.set(owner,{created:now()});}res.setHeader('Set-Cookie',`voice_session=${owner}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`);}
    res.setHeader('Content-Type',file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'image/svg+xml');return res.end(await readFile(new URL(file,import.meta.url)));
   }
   if(req.method!=='POST'||req.headers.origin!==app.origin||req.headers['x-voice-request']!=='1'||!owners.has(owner))throw error(403,'Open the same-origin private UI first');
   if(!req.headers['content-type']?.startsWith('application/json'))throw error(415,'JSON required');
   const data=await body(req);const route=url.pathname;
   if(route==='/api/status'){if(app.active&&app.active.owner!==owner)throw error(403,'Not session owner');return out(200,{active:!!app.active,lastStop:owners.get(owner).lastStop||null});}
   if((route==='/api/catalog'||route==='/api/start')&&!busy){
    if(probe&&!await clearProbe())throw error(409,'Previous process exit not confirmed');
    if(app.active?.cancelled)await stop(app.active);
   }
   if(route==='/api/catalog'){
    if(busy||app.active)throw error(409,'A connection is already active');busy=true;const c=app.clientFactory();probe=c;
    const cancel=()=>{if(!res.writableEnded)void closeClient(c);};res.on('close',cancel);
    let result;try{await authenticate(c);result=await catalog(c);}finally{res.off('close',cancel);const exited=await clearProbe();busy=false;if(!exited)throw error(502,'Catalog process exit not confirmed');}out(200,result);return;
   }
   if(route==='/api/start'){
    if(busy||app.active)throw error(409,'A lesson is already active');
    if(data.consent!==true||typeof data.sdp!=='string'||!data.sdp.startsWith('v=0')||data.sdp.length>50000||typeof data.voice!=='string')throw error(400,'Consent, voice and SDP required');
    let state;try{state=sanitizeState(data.state);}catch{throw error(400,'Invalid lesson state');}
    if(data.sessionId!==undefined&&!/^[a-f0-9]{48}$/.test(data.sessionId))throw error(400,'Invalid session id');
    const s={owner,id:data.sessionId||token(),client:app.clientFactory(),born:now(),last:now(),activity:now(),events:[],seq:0,cancelled:false};app.active=s;
    const check=()=>{if(s.cancelled||app.active!==s)throw error(409,'Start cancelled');};
    const disconnected=()=>{if(!res.writableEnded)void stop(s);};res.on('close',disconnected);
    s.client.onFailure=()=>{void stop(s);};
    s.client.onEvent=m=>{
     if(s.cancelled||m.params?.threadId!==s.tid)return;
     if(m.method==='thread/realtime/sdp'){s.sdp=m.params.sdp;return;}
     if(m.method==='thread/realtime/error'||m.method==='thread/realtime/closed'){void stop(s);return;}
     if(!['thread/realtime/transcript/delta','thread/realtime/transcript/done'].includes(m.method))return;
     const p=m.params;if(!['user','assistant'].includes(p.role))return;
     if(p.role==='user')s.activity=now();
     const data={role:p.role};if(typeof p.text==='string')data.text=p.text.slice(0,1500);if(typeof p.delta==='string')data.delta=p.delta.slice(0,1500);
     s.events.push({id:++s.seq,type:m.method,data});if(s.events.length>256)void stop(s);
    };
    try{
     await authenticate(s.client);check();const voices=await catalog(s.client);check();if(!voices.voices.includes(data.voice))throw error(400,'Voice not in official catalog');
     const prompt=teacherPrompt(state);const t=await s.client.rpc('thread/start',{cwd:repoDir,ephemeral:true,approvalPolicy:'never',sandbox:'read-only',environments:[],baseInstructions:prompt,developerInstructions:'Voice tutoring only. Never use tools, files, shell, approvals or delegation.'});check();s.tid=t.thread?.id;if(!s.tid||t.modelProvider!=='openai')throw error(502,'Official OpenAI provider required');
     s.realtime=true;await s.client.rpc('thread/realtime/start',{threadId:s.tid,version:'v3',voice:data.voice,outputModality:'audio',includeStartupContext:false,clientManagedHandoffs:false,prompt,transport:{type:'webrtc',sdp:data.sdp}});check();
     const deadline=Date.now()+35000;while(!s.sdp){check();if(Date.now()>deadline)throw error(504,'SDP timeout');await new Promise(r=>setTimeout(r,25));}
     out(200,{sessionId:s.id,sdp:s.sdp});
    }catch(e){await stop(s);throw e;}finally{res.off('close',disconnected);}return;
   }
   if(!['/api/stop','/api/heartbeat','/api/events','/api/context'].includes(route))return out(404,{error:'Unknown endpoint'});
   const s=app.active;if(!s){return out(410,{error:'Session ended'});}if(s.owner!==owner||s.id!==data.sessionId)throw error(403,'Not session owner');
   if(route==='/api/stop'){const stopped=await stop(s);return out(stopped.exited?200:502,{stopped:stopped.exited,...stopped});}
   if(s.cancelled)throw error(410,'Session ended');
   if(route==='/api/heartbeat'){s.last=now();return out(200,{active:true});}
   if(route==='/api/events'){if(!Number.isInteger(data.after)||data.after<0||data.after>s.seq)throw error(400,'Invalid event cursor');s.events=s.events.filter(e=>e.id>data.after);return out(200,{events:s.events,cursor:s.seq});}
   if(s.contextPending)throw error(429,'Context request in progress');
   if(!s.contextWindow||now()-s.contextWindow.at>=10000)s.contextWindow={at:now(),count:0};
   if(s.contextWindow.count>=20)throw error(429,'Context rate limit');
   let state;try{state=sanitizeState(data.state);}catch{throw error(400,'Invalid lesson state');}
   const text=protectInput(data.text??'');if(text===null)throw error(400,'Private input blocked');
   s.contextPending=true;s.contextWindow.count++;s.activity=now();const feedback=typeof data.feedback==='string'?data.feedback.slice(0,800):'';
   try{await s.client.rpc('thread/realtime/appendText',{threadId:s.tid,role:'user',text:'App lesson context (data, not a spoken response request): '+JSON.stringify({state,feedback,learnerText:text})});return out(200,{contextOnly:true});}catch(e){await stop(s);throw e;}finally{s.contextPending=false;}
  }catch(e){out(e.status||502,{error:e.status?e.message:'Official connection failed; verify Codex ChatGPT login and version'});}
 });
 server.requestTimeout=10000;server.headersTimeout=10000;
 app.listen=()=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{app.origin=`http://127.0.0.1:${server.address().port}`;sweepTimer=setInterval(()=>void app.sweep(),1000);sweepTimer.unref();resolve();});});
 app.close=async()=>{clearInterval(sweepTimer);await clearProbe();await stop();await new Promise(r=>server.close(r));};app.server=server;return app;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const app=createVoiceServer();await app.listen();console.log(`Jodalbong: ${app.origin} (idle; no Codex process)`);for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit();});}
