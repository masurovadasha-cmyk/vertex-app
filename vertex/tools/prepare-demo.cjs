const fs=require('fs');const path=require('path');
const sharp=require('C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
async function main(){for(const [name,size] of [['icon-192.png',192],['icon-512.png',512],['apple-touch-icon.png',180]])await sharp('dist/icon.svg').resize(size,size).png().toFile(path.join('dist',name));}
main().catch(e=>{console.error(e);process.exit(1);});
