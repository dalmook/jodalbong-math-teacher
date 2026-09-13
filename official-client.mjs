import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export const repoDir=fileURLToPath(new URL('.',import.meta.url));
const allowed=new Set(['initialize','account/read','thread/realtime/listVoices','thread/start','thread/realtime/start','thread/realtime/stop','thread/realtime/appendText']);
export function safeEnvironment(source=process.env){return Object.fromEntries(Object.entries(source).filter(([k])=>!/(?:API[_]?KEY|ACCESS_TOKEN|AUTH_TOKEN|BEARER|OPENAI|AZURE_OPENAI)/i.test(k)));}
export function processArgs(){
 const disabled=['apps','hooks','plugins','remote_plugin','shell_tool','unified_exec','browser_use','computer_use','image_generation','view_image','multi_agent','skill_search','tool_suggest'];
 return ['-c','features.realtime_conversation=true','-c','mcp_servers={}','-c','analytics.enabled=false',...disabled.flatMap(k=>['-c',`features.${k}=false`]),'app-server','--stdio'];
}
export class OfficialClient{
 constructor({bin=process.env.CODEX_BIN||'codex',args=processArgs(),timeout=30000}={}){this.bin=bin;this.args=args;this.timeout=timeout;this.pending=new Map();this.seq=0;this.onEvent=()=>{};this.onFailure=()=>{};this.closing=false;}
 async open(){
  this.proc=spawn(this.bin,this.args,{cwd:repoDir,env:safeEnvironment(),windowsHide:true,stdio:['pipe','pipe','pipe'],shell:false});
  this.proc.stderr.on('data',()=>{});this.proc.stdin.on('error',()=>this.fail());
  this.proc.on('error',()=>this.fail());this.proc.on('exit',()=>this.fail());
  let buffer='';this.proc.stdout.setEncoding('utf8');this.proc.stdout.on('data',chunk=>{
   buffer+=chunk;if(buffer.length>1024*1024){this.fail();void this.close();return;}
   let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);let m;try{m=JSON.parse(line);}catch{continue;}
    // Server requests are always denied, even if their ID collides with our pending RPC.
    if(m.method&&m.id!==undefined){try{this.write({id:m.id,error:{code:-32601,message:'Tools and approvals disabled'}});}catch{this.fail();void this.close();return;}continue;}
    if(m.id!==undefined){const p=this.pending.get(m.id);if(p){clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(Error('Official request rejected')):p.resolve(m.result);}continue;}
    if(m.method?.startsWith('thread/realtime/'))this.onEvent(m);
   }
  });
  await this.rpc('initialize',{clientInfo:{name:'jodalbong_math_teacher',title:'Jodalbong subscription voice tutor',version:'0.3.0'},capabilities:{experimentalApi:true}});this.write({method:'initialized'});
 }
 write(m){
  const input=this.proc?.stdin;if(!input?.writable||this.closing)throw Error('Official client unavailable');
  const line=JSON.stringify(m)+'\n';
  // No application write queue: the stream owns at most one bounded frame after false.
  if(this.blocked)throw Error('Official client backpressure limit');
  if(Buffer.byteLength(line)+(input.writableLength||0)>65536)throw Error('Official client byte limit');
  if(!input.write(line)){this.blocked=true;input.once('drain',()=>{this.blocked=false;});}
 }
 rpc(method,params){
  if(!allowed.has(method))return Promise.reject(Error('RPC not allowed'));
  if(!this.proc||this.proc.exitCode!==null||this.closing)return Promise.reject(Error('Official client unavailable'));
  if(this.pending.size>=32)return Promise.reject(Error('Official client pending limit'));
  const id=++this.seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Official client timeout'));},this.timeout);this.pending.set(id,{resolve,reject,timer});try{this.write({id,method,params});}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}});
 }
 fail(){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Official client closed'));}this.pending.clear();if(!this.closing)this.onFailure();}
 async close(){
  // A failed close remains tracked; only the owned child's exit releases it.
  if(this.proc&&(this.proc.exitCode!==null||this.proc.signalCode!=null))return true;
  if(this.closed)return this.closed;this.closing=true;this.fail();
  this.closed=(async()=>{if(!this.proc||this.proc.exitCode!==null||this.proc.signalCode!=null)return true;return new Promise(resolve=>{const finish=exited=>{clearTimeout(timer);clearTimeout(hard);this.proc.off('exit',onExit);resolve(exited);};const onExit=()=>finish(true);const timer=setTimeout(()=>{this.proc.kill();},500);const hard=setTimeout(()=>finish(false),2000);this.proc.once('exit',onExit);this.proc.stdin.end();});})();return this.closed;
 }
}
