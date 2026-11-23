const STORAGE='eperjadinV2Pilot';
const $=(selector)=>document.querySelector(selector);
const title=$('#status-title'),detail=$('#status-detail');
function render(state){
  const records=state?.records || [], progress=state?.progress || {}, errors=state?.errors || [];
  title.textContent=progress.state === 'running' ? 'Pengambilan berjalan...' : records.length+' SPD tersimpan secara lokal';
  detail.textContent=[progress.message||progress.error||'',progress.completed!=null?progress.completed+' sukses':'' , progress.skipped?progress.skipped+' dilewati':'',errors.length?errors.length+' perlu pemeriksaan':''].filter(Boolean).join(' | ') || 'Pilih pilot 5 SPD terlebih dahulu.';
  $('#export').disabled=records.length===0;
  $('#copy').disabled=records.length===0;
}
async function refresh(){const x=await chrome.storage.local.get(STORAGE);render(x[STORAGE]||null)}
async function tab(){
 const [t]=await chrome.tabs.query({active:true,currentWindow:true});
 if(!t?.id || !t.url?.startsWith('https://satu.kemenkeu.go.id/'))throw new Error('Buka SATU Kemenkeu yang sudah login.');
 return t;
}
async function command(type, payload={}){
 title.textContent='Memproses...';
 try{
  const t=await tab();
  const result=await chrome.tabs.sendMessage(t.id,{type,...payload});
  await refresh();
  if(!result?.ok){detail.textContent=result?.reason || result?.message || 'Halaman tidak didukung.'}
 }catch(e){title.textContent='Perlu pemeriksaan';detail.textContent=e.message||String(e)}
}
$('#start').onclick=()=>command('RUN_PILOT_V2',{limit:Number($('#limit').value),maxPages:5});
$('#stop').onclick=()=>command('STOP_PILOT_V2');
$('#single').onclick=()=>command('CAPTURE_DETAIL_V2');
async function payload(){
 const state=(await chrome.storage.local.get(STORAGE))[STORAGE]||{};
 return {schemaVersion:2,source:'satu-kemenkeu',collector:'pilot-v2',exportedAt:new Date().toISOString(),records:state.records||[],errors:state.errors||[],progress:state.progress||{}};
}
$('#export').onclick=async()=>{
 const data=await payload();const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='eperjadin-pilot-v2-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
};
$('#copy').onclick=async()=>{await navigator.clipboard.writeText(JSON.stringify(await payload()));title.textContent='JSON disalin';};
$('#clear').onclick=async()=>{
 if(!confirm('Hapus semua data SPD lokal pada ekstensi?'))return;
 await chrome.storage.local.remove(STORAGE);await refresh();
};
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes[STORAGE])render(changes[STORAGE].newValue)});
refresh();
