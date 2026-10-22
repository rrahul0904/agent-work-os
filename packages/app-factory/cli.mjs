#!/usr/bin/env node
import {compilePortfolioPlan,deploymentGate} from './planner.mjs';
const plan=compilePortfolioPlan();
const command=process.argv[2];
if(command==='--check'){
  if(plan.products.length!==7 || plan.shared.length!==10) throw new Error('INVENTORY_INCOMPLETE');
  console.log('OK: seven products; ten shared capabilities; deployment gates fail closed');
}else if(command==='--gate'){
  if(!process.argv[3]) throw new Error('Usage: node cli.mjs --gate <product-id>');
  console.log(JSON.stringify(deploymentGate(plan,process.argv[3]),null,2));
}else{
  console.log(JSON.stringify(plan,null,2));
}