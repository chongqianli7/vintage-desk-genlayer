import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createAccount,createClient} from 'genlayer-js';
import {chain,reader,read,fund,wait,execution,succeeded} from '../src/chain.js';

const file='evidence/studionet.json';
const evidence=JSON.parse(fs.readFileSync(file));
const address=evidence.address;
const save=()=>fs.writeFileSync(file,JSON.stringify(evidence,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n');
const nap=ms=>new Promise(r=>setTimeout(r,ms));
async function retry(task,allowed=()=>true){
  for(let i=0;;i++){
    try{return await task();}catch(e){if(i===5||!allowed(e))throw e; await nap(1800*(i+1));}
  }
}
const accounts=[createAccount(),createAccount()];
const [host,trader]=accounts.map(account=>createClient({chain,account}));
evidence.replayWallets=accounts.map(a=>a.address);
const final=[];
const record=(label,client,functionName,args)=>retry(async()=>{
  const hash=await client.writeContract({address,functionName,args,value:0n,fees});
  evidence.transactions[label]={hash};
  save();
  console.log(label,hash);
  return hash;
},e=>/eth_gasPrice|eth_getTransactionCount|eth_estimateGas/i.test(e.message));
async function step(label,client,functionName,args){
  const hash=await record(label,client,functionName,args);
  final.push(retry(()=>wait(hash)).then(tx=>{
    evidence.transactions[label]={hash,status:tx.statusName,execution:execution(tx)};
    save(); console.log(label,tx.statusName,execution(tx));
    return succeeded(tx);
  }).catch(e=>{console.error(label,e.message);return false;}));
  const tx=await retry(()=>reader.waitForTransactionReceipt({hash,waitUntil:'decided',interval:2000,retries:60,fullTransaction:true}));
  if(!succeeded(tx)){
    const receipts=tx.consensus_data?.leader_receipt;
    const leader=Array.isArray(receipts)?receipts.find(r=>r.mode==='leader'):receipts;
    console.error(leader?.genvm_result?.stderr??leader?.result);
    throw Error(label+' execution failed');
  }
}
let fees;
try{
  await Promise.all(accounts.map(a=>retry(()=>fund(a.address))));
  fees=await retry(()=>reader.estimateTransactionFees());
  for(const a of accounts){
    for(let n=0;n<20;n++){
      if(await retry(()=>reader.getBalance({address:a.address}))>fees.feeValue)break;
      if(n===19)throw Error('Faucet funds unavailable');
      await nap(2000);
    }
  }
  const head=BigInt(await retry(()=>read(address,'count')));
  evidence.normalId=String(head+1n);
  evidence.mismatchId=String(head+2n);
  save();
  const path='2024/gross-domestic-product-third-quarter-2024-advance-estimate';
  for(const [label,id,quarter,forecast] of [
    ['release',head+1n,3n,[10n,75n,15n]],['mismatch',head+2n,2n,[20n,65n,15n]]
  ]){
    await step(label+'_open',host,'open_market',[2024n,quarter,'advance',path,200n,300n,0n,true]);
    await step(label+'_submit',trader,'forecast',[id,...forecast]);
    await step(label+'_freeze',host,'freeze',[id]);
    await step(label+'_settle',trader,'settle',[id]);
  }
  assert((await Promise.all(final)).every(Boolean));
  for(const id of [evidence.normalId,evidence.mismatchId])evidence.markets[id]=await retry(()=>read(address,'get_market',[BigInt(id)]));
  save();
  const normal=evidence.markets[evidence.normalId];
  const mismatch=evidence.markets[evidence.mismatchId];
  assert.equal(normal.status,'SETTLED');
  assert.equal(Number(normal.result),280);
  assert.equal(JSON.parse(normal.entries)[0][4],19050);
  assert.equal(mismatch.status,'SOURCE_PENDING');
  assert.equal(mismatch.evidence,'WRONG_PERIOD');
  assert.equal(JSON.parse(mismatch.entries)[0].length,4);
  const deployment=await retry(()=>reader.getTransaction({hash:evidence.transactions.deployment.hash}));
  const bytes=deployment.data.contract_code;
  const source=fs.readFileSync('contracts/vintage_desk.py');
  assert([Buffer.from(bytes,'base64'),Buffer.from(bytes),Buffer.from(bytes.replace(/^0x/,''),'hex')].some(b=>b.equals(source)));
  evidence.deploymentSourceMatches=true;
  save();
}catch(e){
  console.error(e.message);process.exitCode=1;await Promise.allSettled(final);
}
