const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const {directory}=JSON.parse(fs.readFileSync(path.join(root,'.vercel/rehearsal-location.json'),'utf8'));
const parent=path.resolve(process.env.LOCALAPPDATA,'TradeWorx');
if(!path.resolve(directory).startsWith(parent+path.sep)||!path.basename(directory).startsWith('restricted-rehearsal-'))throw new Error('Restricted local directory required');
const command=process.argv[2];
if(!['start','stop','check-auth'].includes(command))throw new Error('Use start, stop or check-auth');
if(command==='check-auth'){
  const result=spawnSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-w','-c','SELECT 1'],{encoding:'utf8',windowsHide:true,env:{...process.env,PGHOST:'127.0.0.1',PGPORT:'55440',PGUSER:'rehearsal_admin',PGDATABASE:'rehearsal',PGPASSWORD:'deliberately-incorrect-verification-password'}});
  if(result.status===0||!/password authentication failed/i.test(result.stderr))throw new Error('Password-isolation check failed');
  console.log('Restricted database rejects an incorrect password.');
}else{
  const args=['-D',path.join(directory,'data'),'-w',...(command==='start'?['-l',path.join(directory,'postgres.log'),'-o','-h 127.0.0.1 -p 55440 -c timezone=UTC','start']:['-m','fast','stop'])];
  const result=spawnSync('C:/Program Files/PostgreSQL/18/bin/pg_ctl.exe',args,{windowsHide:true,stdio:'ignore'});
  if(result.status!==0)throw new Error('Restricted database '+command+' failed; inspect its private log');
  console.log('Restricted database '+(command==='start'?'started on loopback port 55440.':'stopped; files retained.'));
}
