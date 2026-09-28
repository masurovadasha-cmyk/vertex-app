const fs=require('fs'),path=require('path'),cp=require('child_process');
const root=path.resolve(__dirname,'vertex');
if(process.stdin.isTTY)process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');let input='';
console.log('Ready for private publishing credential on stdin (hidden).');
process.stdin.on('data',chunk=>{input+=chunk;if(!input.includes('\n'))return;process.stdin.pause();try{main(JSON.parse(input.trim()));}catch(e){console.error(e.message);process.exitCode=1;}finally{if(process.stdin.isTTY)process.stdin.setRawMode(false);process.exit(process.exitCode||0);}});
function main(credential){
 const expected='appgprj_6aba142741e481918a49d0f38f20dc24';
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'.openai/hosting.json'),'utf8').replace(/^\uFEFF/,''));
 if(manifest.project_id!==expected||!credential.remote_url.includes(expected))throw Error('Site identity mismatch');
 const env={...process.env,GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_COUNT:'2',GIT_CONFIG_KEY_0:'safe.directory',GIT_CONFIG_VALUE_0:root.replaceAll('\\','/'),GIT_CONFIG_KEY_1:'http.extraHeader',GIT_CONFIG_VALUE_1:'Authorization: Bearer '+credential.token};
 function run(exe,args){const r=cp.spawnSync(exe,args,{cwd:root,env,encoding:'utf8'});if(r.status!==0)throw Error('Publishing step failed: '+exe+' '+args[0]+' (exit '+r.status+')');return r.stdout.trim();}
 run('git',['add','--all']);
 run('git',['-c','user.name=Codex','-c','user.email=codex@local','commit','-m','Unify Vertex mobile prototype and installation flow']);
 const sha=run('git',['rev-parse','HEAD']);
 run('git',['push',credential.remote_url,sha+':refs/heads/'+credential.branch]);
 const remote=run('git',['ls-remote',credential.remote_url,'refs/heads/'+credential.branch]).split(/\s+/)[0];if(remote!==sha)throw Error('Pushed source verification failed');
 const stage=fs.mkdtempSync(path.join(__dirname,'vertex-publish-'));
 fs.cpSync(path.join(root,'dist'),path.join(stage,'dist'),{recursive:true});
 fs.mkdirSync(path.join(stage,'dist','.openai'));fs.writeFileSync(path.join(stage,'dist','.openai','hosting.json'),JSON.stringify(manifest));
 const archive=path.join(__dirname,'vertex-v2.tar.gz');run('tar',['-czf',archive,'-C',stage,'dist']);
 const entries=run('tar',['-tzf',archive]);if(!entries.includes('dist/.openai/hosting.json')||!entries.includes('dist/mobile.js'))throw Error('Incomplete archive');
 console.log(JSON.stringify({project_id:expected,commit_sha:sha,archive}));
}
