import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {writeRecipeFiles} from '../packages/solution-factory/src/stack-recipe.js';

const args=process.argv.slice(2);
if(args.length<4||args.length>5||args[0]!=='--recipe'||args[2]!=='--parent'||(args.length===5&&args[4]!=='--dry-run')){
 console.error('usage: npm run recipe -- --recipe FILE.json --parent EXISTING_DIRECTORY [--dry-run]');
 process.exit(2);
}
try{
 const spec=JSON.parse(await readFile(resolve(args[1]),'utf8'));
 const result=await writeRecipeFiles(resolve(args[3]),spec,{dryRun:args[4]==='--dry-run'});
 console.log(JSON.stringify(result,null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
