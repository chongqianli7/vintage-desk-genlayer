import fs from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createAccount,createClient} from 'genlayer-js';
import {chain,reader,read,fund,wait,execution,succeeded} from '../src/chain.js';

const source=fs.readFileSync('contracts/vintage_desk.py','utf8');
const evidence={chainId:chain.id, sourceSha256:createHash('sha256').update(source).digest('hex'), transactions:{}, markets:{}};
const save=()=>fs.writeFileSync('evidence/studionet.json',JSON.stringify(evidence,(_,v)=>typeof v==='bigint'?String(v):v,2)+'\n');
const accounts=[createAccount(),createAccount()];
const [host,trader]=accounts.map(account=>createClient({chain,account}));
evidence.wallets=accounts.map(a=>a.address);
const final=[];
async function record(label,promise,expected=true){
  const hash=await promise;
  evidence.transactions[label]={hash};
  save();
  console.log(label,hash);
  final.push(wait(hash).then(tx=>{
    evidence.transactions[label]={hash,status:tx.statusName,execution:execution(tx)};
    save();
    console.log(label,tx.statusName,execution(tx));
    return succeeded(tx)===expected;
  }).catch(e=>{console.error(label,e.message);return false;}));
  const tx=await reader.waitForTransactionReceipt({hash,waitUntil:'decided',interval:2000,retries:120,fullTransaction:true});
  assert.equal(succeeded(tx),expected,label);
  return tx;
}
try{
  evidence.schema=await reader.getContractSchemaForCode(source);
  save();
  await Promise.all(accounts.map(a=>fund(a.address)));
  const fees=await reader.estimateTransactionFees();
  for(const a of accounts){
    for(let n=0;n<20;n++){
      if(await reader.getBalance({address:a.address})>fees.feeValue)break;
      if(n===19)throw Error('Faucet funds unavailable');
      await new Promise(r=>setTimeout(r,1600));
    }
  }
  const deployment=await record('deployment',host.deployContract({code:source,args:[],fees}));
  const address=deployment.data?.contract_address??deployment.to_address;
  evidence.address=address;
  save();
  const write=(client,functionName,args)=>client.writeContract({address,functionName,args,value:0n,fees});
  const path='2024/gross-domestic-product-third-quarter-2024-advance-estimate';
  await record('open_normal',write(host,'open_market',[2024n,3n,'advance',path,200n,300n,0n,true]));
  await record('submit_normal',write(trader,'forecast',[1n,10n,75n,15n]));
  await record('duplicate',write(trader,'forecast',[1n,10n,75n,15n]),false);
  await record('unauthorized_freeze',write(trader,'freeze',[1n]),false);
  await record('freeze_normal',write(host,'freeze',[1n]));
  await record('settle_normal',write(trader,'settle',[1n]));
  await record('open_mismatch',write(host,'open_market',[2024n,2n,'advance',path,200n,300n,0n,true]));
  await record('submit_mismatch',write(trader,'forecast',[2n,20n,65n,15n]));
  await record('freeze_mismatch',write(host,'freeze',[2n]));
  await record('settle_mismatch',write(trader,'settle',[2n]));
  assert((await Promise.all(final)).every(Boolean));
  for(const id of [1n,2n])evidence.markets[id]=await read(address,'get_market',[id]);
  save();
  assert.equal(evidence.markets[1].status,'SETTLED');
  assert.equal(Number(evidence.markets[1].result),280);
  assert.equal(JSON.parse(evidence.markets[1].entries)[0][4],19050);
  assert.equal(evidence.markets[2].status,'SOURCE_PENDING');
  assert.equal(evidence.markets[2].evidence,'WRONG_PERIOD');
  assert.equal(JSON.parse(evidence.markets[2].entries)[0].length,4);
  const bytes=deployment.data.contract_code;
  assert([Buffer.from(bytes,'base64'),Buffer.from(bytes),Buffer.from(bytes.replace(/^0x/,''),'hex')].some(b=>b.equals(Buffer.from(source))));
  evidence.deploymentSourceMatches=true;
  save();
}catch(e){
  console.error(e.message);
  process.exitCode=1;
  await Promise.allSettled(final);
}
