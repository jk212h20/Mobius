#!/usr/bin/env node
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const MobiusReplay = require('../replay-core.js');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 34124);
const dataDir = process.env.MOBIUS_DATA_DIR || path.join('/tmp', `mobius-diamond-${Date.now()}`);
const base = `http://127.0.0.1:${port}`;
function req(method, pathname, body) { return new Promise((resolve, reject) => { const data = body ? Buffer.from(JSON.stringify(body)) : null; const r = http.request(base + pathname, { method, headers: data ? {'content-type':'application/json','content-length':data.length} : {} }, res => { let out=''; res.setEncoding('utf8'); res.on('data', c => out += c); res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(out) }); } catch { resolve({ status: res.statusCode, text: out }); } }); }); r.on('error', reject); if (data) r.write(data); r.end(); }); }
function startServer(){fs.mkdirSync(dataDir,{recursive:true});return spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),MOBIUS_DATA_DIR:dataDir},stdio:['ignore','pipe','pipe']});}
async function waitServer(proc){const end=Date.now()+15000;while(Date.now()<end){if(proc.exitCode!==null)throw new Error('server exited');try{const r=await req('GET','/api/version');if(r.status===200)return}catch{}await new Promise(r=>setTimeout(r,250));}throw new Error('server did not start')}
function makeRun(){
  const p=MobiusReplay.levelParams('diamond'), rows=p.rows;
  const run={schema:1,runId:'diamond-coin-fixture',buildSha:'test',level:'diamond',snapshot:{reason:'diamond-fixture',level:'diamond',cols:p.cols,sideCols:p.sideCols,rows,physHz:120,lifeEvery:26,lifeRunning:false,lifeStepCounter:0,cells:'0'.repeat(p.cols*rows),sideCells:'0'.repeat(p.sideCols*rows),pose:{route:'main',t:0,s:0,sideQ:0,sideU:.5,sideDir:1,faceSign:1,sideFaceSign:1,speed:0,lateralSpeed:0,headingVec:{x:0,y:1,z:0}}},inputs:[],finished:null};
  let st=MobiusReplay.makeInitialState(run);
  run.snapshot.worldHash=MobiusReplay.computeWorldHashFromCells(st.cells,st.sideCells);
  const specs=MobiusReplay.diamondCoinSpecs();
  for(let i=0;i<specs.length;i++){
    const spec=specs[i];
    const frame=i+1;
    let pose;
    if(spec.kind==='main') pose={route:'main',t:spec.t,s:spec.s,faceSign:spec.halfFaceSign,sideFaceSign:1};
    else pose={route:'side',sideQ:spec.q,sideU:spec.u,sideDir:spec.halfFaceSign>0?1:-1,sideFaceSign:spec.halfFaceSign,faceSign:1};
    run.inputs.push({frame,bits:0,pose});
  }
  const verified=MobiusReplay.verifyRun(run,{maxFrames:60});
  run.finished={...verified.summary.finished,worldHashEnd:verified.summary.endHash};
  return run;
}
(async()=>{
  const run=makeRun();
  const local=MobiusReplay.verifyRun(run,{maxFrames:60});
  console.log('local', JSON.stringify({pass:local.pass,failures:local.failures,finished:local.summary.finished,inputDeltas:run.inputs.length}));
  if(!local.pass) throw new Error('local diamond coin verification failed');
  const proc=startServer();
  try{
    await waitServer(proc);
    const post=await req('POST','/api/runs',{run,handle:'DIAMOND_TEST',address:'diamond-prize-address'});
    console.log('POST',post.status,JSON.stringify(post.json&&{ok:post.json.ok,saved:post.json.saved,failures:post.json.failures,summary:post.json.summary&&post.json.summary.finished}));
    if(post.status!==200||!post.json.ok||!post.json.saved)throw new Error('diamond run not saved');
  }finally{if(proc.exitCode===null)proc.kill()}
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
