import { createAccount, createClient } from 'genlayer-js';
import { formatEther } from 'viem';
import { chain, explorer, reader, read, fund, wait, execution, succeeded } from './chain.js';
import deployment from './deployment.json';

const $ = id => document.getElementById(id);
const el = (tag, content = '') => Object.assign(document.createElement(tag), {textContent:content});
const button = (label, action) => Object.assign(el('button',label),{onclick:action,type:'button'});
const same = (a,b) => Boolean(a && b && String(a).toLowerCase() === String(b).toLowerCase());
const asLink = (label, href) => Object.assign(el('a',label),{href,target:'_blank',rel:'noopener'});
const txLink = hash => asLink('View transaction',explorer + hash);
const address = deployment.address;
const demo = [];
const providers = new Map();
let wallet, market, marketId, busy = false, refreshId = 0;

function status(message,hash) {
  $('status').replaceChildren(el('span',message));
  if(hash)$('status').append(' · ',txLink(hash));
}
async function guarded(action) {
  try { await action(); } catch(error) { status(error.shortMessage || error.message); }
}
function percent(value){return (Number(value)/100).toFixed(2)+'%';}
const reason = { WRONG_PERIOD:'The release describes a different quarter. Forecasts remain unscored.', NOT_FOUND:'No release found at the locked URL. Retry after publication.', MISSING_OBSERVATION:'The page does not contain a verifiable headline observation.'};
function details(){
  const target=$('market-detail');
  target.replaceChildren();
  if(!market){target.append(el('h2','GDP release markets'),el('p','No finalized market to display.'));return;}
  const m=market;
  const entries=JSON.parse(m.entries);
  const owner=same(m.organizer,wallet?.address);
  const submitted=entries.some(row=>same(row[0],wallet?.address));
  const deadlinePassed=!m.replay && Date.now()/1000>=Number(m.close_time);
  const opened=m.status==='OPEN'&&!deadlinePassed;
  const closed=m.status==='SETTLED';
  const heading=el('div');
  heading.className='heading';
  const tag=el('span',deadlinePassed && m.status==='OPEN'?'AWAITING FREEZE':m.status.replaceAll('_',' '));
  tag.className='tag';
  heading.append(el('h2','Q'+m.quarter+' '+m.year+' real GDP'),tag);
  target.append(heading,el('p',(m.replay?'Historical replay':'Live forecast')+' · '+m.edition+' estimate · Market #'+marketId));
  const bounds=['Below '+percent(m.lower),percent(m.lower)+'–<'+percent(m.upper),percent(m.upper)+' and above'];
  const ranges=el('div');
  ranges.className='range-grid';
  for(let i=0;i<3;i++){
    const mean=entries.length ? entries.reduce((sum,row)=>sum+row[i+1],0)/entries.length : null;
    const item=el('div');
    item.className='range'+(closed&&Number(m.outcome)===i?' won':'');
    item.append(el('p',['LOW','BASE','HIGH'][i]),el('strong',bounds[i]));
    if(mean!==null) {
      const meter=Object.assign(el('meter'),{min:0,max:100,value:mean});
      meter.setAttribute('aria-label','Mean forecast probability');
      item.append(el('output',mean.toFixed(1)+'%'),meter);
    }else item.append(el('output','—'));
    ranges.append(item);
  }
  const caption=el('p',entries.length+' forecast'+(entries.length===1?'':'s')+' · Mean probability by band');
  caption.className='muted';
  target.append(ranges,caption);
  if(opened&&wallet&&!submitted){
    const form=el('form');
    const row=el('div');
    row.className='form-grid';
    for(const [index,label] of ['Low probability','Base probability','High probability'].entries()){
      const wrapper=el('label',label);
      wrapper.append(Object.assign(el('input'),{type:'number',name:'p'+index,value:[20,60,20][index],min:0,max:100,required:true}));
      row.append(wrapper);
    }
    const submit=el('button','Sign forecast');submit.className='primary';
    form.append(row,el('p','Allocate exactly 100 probability points.'),submit);
    form.onsubmit=event=>{
      event.preventDefault();
      const values=[...new FormData(form).values()].map(BigInt);
      if(values.reduce((a,b)=>a+b,0n)!==100n){status('Allocate exactly 100 points.');return;}
      transact('Record probability forecast','forecast',[marketId,...values]);
    };
    target.append(form);
  }else if(opened)target.append(el('p',submitted?'Your forecast is recorded.':'Connect a wallet to submit a forecast.'));
  const actions=el('div');actions.className='actions';
  if(wallet&&m.status==='OPEN'&&(m.replay?owner:deadlinePassed))actions.append(button('Freeze submissions',()=>transact('Freeze submissions','freeze',[marketId])));
  if(wallet&&['FROZEN','SOURCE_PENDING'].includes(m.status))actions.append(button('Verify and settle',()=>transact('Verify BEA release and settle scores','settle',[marketId])));
  target.append(actions);
  const section=el('section');section.className='evidence';
  section.append(el('h3',closed?'Settlement':'Settlement terms'),el('p','Organizer · '+m.organizer),
    asLink('Official BEA release','https://www.bea.gov/news/'+m.path));
  if(!m.replay)section.append(el('p','Forecasts close · '+new Date(Number(m.close_time)*1000).toISOString()));
  section.append(el('p',closed?'Verified growth '+percent(m.result)+' · '+['Low','Base','High'][Number(m.outcome)]+' band':
    reason[m.evidence]??(m.status==='FROZEN'?'Anyone can ask validators to verify the locked source.':m.replay?'Only the replay organizer can freeze submissions.':'After the close, any wallet can freeze the market.')));
  if(entries.length){
    const scores=el('div');scores.className='scores';
    scores.append(el('h3',closed?'Forecast scores':'Forecast positions'));
    for(const entry of [...entries].sort((a,b)=>(b[4]??0)-(a[4]??0))){
      const line=el('div');line.className='score';
      line.append(el('span',entry[0]),el('span',entry.slice(1,4).join(' / ')+(closed?' · '+entry[4]+' pts':'')));
      scores.append(line);
    }
    section.append(scores);
  }
  const links=el('div');links.className='links';
  for(const [label,hash] of deployment.examples.find(row=>BigInt(row[0])===marketId)?.[2]??[])links.append(asLink(label,explorer+hash));
  section.append(links);
  target.append(section);
}
async function refresh(selected=marketId){
  if(!address){status('Deployment is unavailable.');details();return;}
  const current=++refreshId;
  const id=selected||BigInt(await read(address,'count'));
  const loaded=id?await read(address,'get_market',[id]):null;
  if(current!==refreshId)return;
  marketId=id;market=loaded;details();
}
async function identify() {
  const current = wallet;
  if (!current) $('identity').textContent = 'Read-only visitor';
  else {
    const prefix = current.mode + ' · ' + current.address;
    $('identity').textContent = prefix + ' · Reading network and balance';
    const network = current.provider ? Number(await current.provider.request({method:'eth_chainId'})) : chain.id;
    const networkText = ' · Chain ' + network + (network !== chain.id ? ' · Switch network before writing' : '');
    try {
      const balance = await reader.getBalance({address:current.address});
      if (current === wallet) $('identity').textContent = prefix + networkText + ' · ' + formatEther(balance) + ' test GEN';
    } catch {
      if (current === wallet) $('identity').textContent = prefix + networkText + ' · Balance unavailable';
    }
  }
  details();
}
async function select(next) {
  if (wallet?.provider) {
    wallet.provider.removeListener?.('accountsChanged', accountChange);
    wallet.provider.removeListener?.('chainChanged', networkChange);
  }
  wallet = next;
  if (wallet?.provider) {
    wallet.provider.on?.('accountsChanged', accountChange);
    wallet.provider.on?.('chainChanged', networkChange);
  }
  $('wallet').close();
  await identify();
}
function accountChange(accounts) {
  if (wallet?.provider) guarded(() => select(accounts[0] ? {...wallet,address:accounts[0]} : null));
}
function networkChange() { guarded(identify); }
function drawWallets() {
  $('providers').replaceChildren(...[...providers.values()].map(({info, provider}) => button(info.name, () => guarded(async () => {
    const [account] = await provider.request({method:'eth_requestAccounts'});
    if (!account) throw new Error('Wallet did not return an account.');
    await select({mode:info.name, address:account, provider});
  }))));
  if (!providers.size) $('providers').append(el('p','Install MetaMask or OKX Wallet to connect an extension.'));
  $('demo').replaceChildren(button('Create demo wallet', () => guarded(async () => {
    const signer = createAccount();
    const entry = {mode:'Demo wallet ' + (demo.length + 1), address:signer.address, signer};
    demo.push(entry);
    await select(entry);
  })), ...demo.map(entry => button(entry.mode, () => guarded(() => select(entry)))),
  button('Fund selected demo wallet', () => guarded(async () => {
    if (!wallet?.signer) throw new Error('Select a demo wallet first.');
    await fund(wallet.address);
    await identify();
  })), button('Reset demo wallets', () => guarded(async () => {
    demo.length = 0;
    if (wallet?.signer) await select(null);
    drawWallets();
  })));
}
window.addEventListener('eip6963:announceProvider', ({detail}) => {
  providers.set(detail.info.rdns, detail);
  if ($('wallet').open) drawWallets();
});
window.dispatchEvent(new Event('eip6963:requestProvider'));
for (const [rdns, name, provider] of [['com.okxwallet','OKX Wallet',window.okxwallet],
  ['io.metamask','MetaMask',window.ethereum?.isMetaMask ? window.ethereum : null],
  ['injected','Browser wallet',window.ethereum?.isMetaMask ? null : window.ethereum]]) {
  if (provider && ![...providers.values()].some(entry => entry.provider === provider)) providers.set(rdns,{info:{name},provider});
}
$('wallet-open').onclick = () => { drawWallets(); $('wallet').showModal(); };
$('disconnect').onclick = () => guarded(() => select(null));
$('switch').onclick = () => guarded(async () => {
  const provider = wallet?.provider;
  if (!provider) throw new Error('Connect an extension wallet first.');
  const chainId = '0xf22f';
  try { await provider.request({method:'wallet_switchEthereumChain', params:[{chainId}]}); }
  catch (error) {
    if (error.code !== 4902) throw error;
    await provider.request({method:'wallet_addEthereumChain', params:[{chainId, chainName:'GenLayer Stable Studionet',
      nativeCurrency:{name:'GEN',symbol:'GEN',decimals:18}, rpcUrls:chain.rpcUrls.default.http}]});
  }
  await identify();
});
async function transact(purpose, functionName, args) {
  if (busy) return;
  if (!wallet) { status('Connect a wallet to sign this operation.'); return; }
  if (!address) { status('No verified deployment is configured.'); return; }
  busy = true;
  const current = wallet;
  let hash;
  try {
    if (!window.confirm(purpose + '\nStable Studionet (61999)\n' + current.address)) {
      status('Signing canceled.');
      return;
    }
    if (current.provider) {
      const [accounts, network] = await Promise.all([current.provider.request({method:'eth_accounts'}),
        current.provider.request({method:'eth_chainId'})]);
      if (wallet !== current || !same(accounts[0], current.address) || Number(network) !== chain.id) throw new Error('Account or network changed. Select the correct account on Studionet.');
    }
    status('Waiting for signature · ' + purpose);
    const signer = createClient({chain, account:current.signer ?? current.address, provider:current.provider});
    hash = await signer.writeContract({address, functionName, args, value:0n, fees:await reader.estimateTransactionFees()});
    status(functionName === 'settle' ? 'Submitted · Waiting for source consensus and finality' : 'Submitted · Waiting for finality', hash);
    let receipt;
    try { receipt = await wait(hash); }
    catch (error) { status('Submitted · Finality could not be confirmed. Check Explorer before retrying.', hash); return; }
    if (!succeeded(receipt)) { status('Finalized · Execution rejected (' + execution(receipt) + ')', hash); return; }
    try {
      await refresh(functionName === 'open_market' ? 0n : undefined);
      if (functionName === 'open_market') showCreator(false);
      status('Finalized · Execution succeeded · State refreshed', hash);
    } catch {
      status('Execution succeeded · Refresh chain to read final state', hash);
    }
  } catch (error) { status(error.code === 4001 ? 'Signing canceled.' : error.shortMessage || error.message, hash); }
  finally { busy = false; }
}
function showCreator(open){
  $('creator').hidden=!open;
  $('market-detail').hidden=open;
}
$('create-toggle').onclick=()=>showCreator(true);
$('cancel-create').onclick=()=>showCreator(false);
$('lookup-form').onsubmit=event=>{
  event.preventDefault();
  const value=new FormData(event.currentTarget).get('market');
  showCreator(false);
  guarded(()=>refresh(value?BigInt(value):0n));
};
for(const [id,title] of deployment.examples)$('examples').append(button(title,()=>{
  showCreator(false);guarded(()=>refresh(BigInt(id)));
}));
$('create-form').onsubmit=event=>{
  event.preventDefault();
  guarded(async()=>{
    const data=new FormData(event.currentTarget);
    const url=new URL(data.get('source'));
    if(url.origin!=='https://www.bea.gov'||!url.pathname.startsWith('/news/')||url.search||url.hash){
      status('Use a direct official BEA release URL.');return;
    }
    const replay=data.get('mode')==='replay';
    const close=replay?0:Math.floor(Date.parse(data.get('close')+'Z')/1000);
    if(!Number.isFinite(close)){status('Enter the live close time in UTC.');return;}
    await transact('Lock market terms','open_market',[
      BigInt(data.get('year')),BigInt(data.get('quarter')),data.get('edition'),url.pathname.slice(6),
      BigInt(Math.round(Number(data.get('lower'))*100)),BigInt(Math.round(Number(data.get('upper'))*100)),BigInt(close),replay
    ]);
  });
};
guarded(()=>refresh(deployment.examples.length?BigInt(deployment.examples[0][0]):0n));
