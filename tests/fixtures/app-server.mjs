// Explicit offline protocol fixture. Never calls Codex or a network provider.
import readline from 'node:readline';
const lines=readline.createInterface({input:process.stdin});
let initialized=false;
lines.on('line',line=>{const m=JSON.parse(line);if(!m.id)return;let result={};
 if(m.method==='initialize'){if(m.params.capabilities.experimentalApi!==true)process.exit(2);initialized=true;}
 else if(!initialized)process.exit(3);
 if(m.method==='account/read')result={account:{type:'chatgpt'}};
 if(m.method==='thread/realtime/listVoices')result={voices:{v1:['juniper'],defaultV1:'juniper'}};
 process.stdout.write(JSON.stringify({id:m.id,result})+'\n');
});
