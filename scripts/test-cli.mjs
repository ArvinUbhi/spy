// Real Copilot host/SDK; only the model service is a local deterministic fixture.
import http from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createViewer} from '../server/index.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const cli=process.env.SPY_COPILOT_CLI||'copilot';
const home=await mkdtemp(resolve(tmpdir(),'spy-cli-compat-'));
const target=resolve(home,'extensions/spy');
let viewer,mock,child,timer,passed=false,output='',registered=false;
const env={...process.env};
for(const key of Object.keys(env))if(/^(COPILOT_|GITHUB_|GH_|OPENAI_|ANTHROPIC_|AZURE_|SPY_)/.test(key)||/TOKEN|API_KEY|SECRET/.test(key))delete env[key];
Object.assign(env,{COPILOT_HOME:home,COPILOT_OFFLINE:'true',COPILOT_MODEL:'spy-test',COPILOT_PROVIDER_TYPE:'openai',COPILOT_PROVIDER_WIRE_API:'completions',COPILOT_PROVIDER_MAX_PROMPT_TOKENS:'32000',COPILOT_PROVIDER_MAX_OUTPUT_TOKENS:'256'});
try{
 const version=spawnSync(cli.endsWith('.js')?process.execPath:cli,cli.endsWith('.js')?[cli,'--version']:['--version'],{cwd:home,env,encoding:'utf8',timeout:30000});
 assert.equal(version.status,0,version.stderr||version.error?.message);const cliVersion=version.stdout.trim().split('\n')[0];
 await writeFile(resolve(home,'settings.json'),JSON.stringify({experimental:true,connectors:false,autoUpdate:false}));
 const install=spawnSync(process.execPath,[resolve(root,'scripts/install-bridge.mjs')],{cwd:root,env:{...env,SPY_EXTENSION_DIR:target},encoding:'utf8'});
 assert.equal(install.status,0,install.stderr);
 viewer=await createViewer({port:0,production:true});env.SPY_URL=`http://127.0.0.1:${viewer.server.address().port}`;
 mock=http.createServer(async(req,res)=>{
  let body='';for await(const chunk of req){body+=chunk;if(body.length>2000000){res.writeHead(413);return res.end();}}
  let input={};try{input=JSON.parse(body);}catch{}
  registered ||= input.tools?.some(t=>t.function?.name==='spy_observe')||false;
  const data={id:'spy-compat',object:'chat.completion.chunk',created:1,model:'spy-test',choices:[{index:0,delta:{role:'assistant',content:'OK'},finish_reason:null}]};
  if(input.stream){res.setHeader('content-type','text/event-stream');res.write('data: '+JSON.stringify(data)+'\n\n');setTimeout(()=>{data.choices[0].delta={};data.choices[0].finish_reason='stop';res.end('data: '+JSON.stringify(data)+'\n\ndata: [DONE]\n\n');},7000).unref();}
  else{res.setHeader('content-type','application/json');res.end(JSON.stringify({...data,object:'chat.completion',choices:[{index:0,message:{role:'assistant',content:'OK'},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:1,total_tokens:11}}));}
 });
 await new Promise(r=>mock.listen(0,'127.0.0.1',r));env.COPILOT_PROVIDER_BASE_URL=`http://127.0.0.1:${mock.address().port}/v1`;
 const args=['--experimental','--trust-folder','--disable-builtin-mcps','--log-level','error','--log-dir',resolve(home,'logs'),'-p','Reply OK only'];
 child=spawn(cli.endsWith('.js')?process.execPath:cli,cli.endsWith('.js')?[cli,...args]:args,{cwd:home,env,stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',chunk=>output=(output+chunk).slice(-4000));child.stderr.on('data',chunk=>output=(output+chunk).slice(-4000));
 timer=setTimeout(()=>child.kill(),90000);
 const code=await new Promise((yes,no)=>{child.once('error',no);child.once('exit',yes);});
 assert.equal(code,0,output);assert.equal(registered,true,'Real CLI must register spy_observe');
 const sessions=viewer.store.snapshot();assert.equal(sessions.length,1,'Real CLI events must reach Spy');
 assert.ok(sessions[0].bridgeMetrics?.rssMiB>0,'Real bridge heartbeat must reach Spy');
 passed=true;
 const report={passed,node:process.version,platform:process.platform,cli:cliVersion,registeredSpyTool:registered,liveSessions:sessions.length,heartbeatReceived:true,scope:'Real Copilot CLI and bundled SDK; isolated offline home and local model fixture. No GitHub login, paid model or enterprise policy acceptance.'};
 await mkdir(resolve(root,'reports'),{recursive:true});await writeFile(resolve(root,'reports/cli-compatibility.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{
 clearTimeout(timer);
 if(child&&child.exitCode===null&&child.signalCode===null){child.kill();await new Promise(r=>child.once('exit',r));}
 await viewer?.close();if(mock)await new Promise(r=>{mock.close(r);mock.closeAllConnections();});
 await rm(home,{recursive:true,force:true});
 if(!passed)console.error('Real CLI compatibility failed. Use SPY_COPILOT_CLI to point to the pinned Copilot 1.0.113 executable or npm-loader.js.');
}
