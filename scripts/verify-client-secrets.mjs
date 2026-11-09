import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {parseEnv} from "node:util";
const root=path.resolve(import.meta.dirname,"..");
const env=parseEnv(await readFile(path.join(root,"backend/.env"),"utf8"));
const secrets=[env.GNANI_API_KEY,env.GNANI_EVON_API_KEY].filter(value=>value&&value.length>10);
let count=0;
async function scan(directory){
  for(const item of await readdir(directory,{withFileTypes:true})) {
    const file=path.join(directory,item.name);
    if(item.isDirectory())await scan(file);
    else {const data=await readFile(file);count++;if(secrets.some(secret=>data.includes(Buffer.from(secret))))throw new Error(`Backend credential found in public output: ${path.relative(root,file)}`);}
  }
}
await scan(path.join(root,"frontend/.next/static"));
await scan(path.join(root,"frontend/public"));
console.log(`Checked ${count} public files against ${secrets.length} configured backend secrets. No matches. Secret values were not printed.`);
