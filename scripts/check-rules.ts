import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export interface RuleManifest {
  sources:{id:string,url:string,edition:string,pages:number,sha256:string}[];
  requirements:{id:string,category:string,sourceRefs:{sourceId:string,page:number}[],caseIds:string[],milestone:string,status:string}[];
}
export function checkRules(manifest:RuleManifest,stage:string):{errors:string[]} {
  const errors:string[]=[];
  const categories=['setup','map','actions','power','science','abilities','cities','rounds','scoring','playerCounts'];
  if(!['inventory','m1','m3'].includes(stage)) errors.push('INVALID_STAGE');
  const ids=new Set<string>();
  const sources=new Map(manifest.sources.map(s=>[s.id,s]));
  for(const s of manifest.sources){
    if(!/^https:\/\//.test(s.url)||!s.edition||!Number.isInteger(s.pages)||s.pages<1||!/^[a-f0-9]{64}$/i.test(s.sha256)) errors.push(`INVALID_SOURCE:${s.id}`);
  }
  if(sources.size!==manifest.sources.length) errors.push('DUPLICATE_SOURCE');
  for(const category of categories) if(!manifest.requirements.some(r=>r.category===category)) errors.push(`MISSING_CATEGORY:${category}`);
  for(const r of manifest.requirements){
    if(ids.has(r.id)) errors.push(`DUPLICATE_ID:${r.id}`);
    ids.add(r.id);
    if(!categories.includes(r.category)) errors.push(`INVALID_CATEGORY:${r.id}`);
    if(!r.sourceRefs.length) errors.push(`MISSING_SOURCE:${r.id}`);
    for(const ref of r.sourceRefs){
      const source=sources.get(ref.sourceId);
      if(!source) errors.push(`MISSING_SOURCE:${r.id}`);
      else if(!Number.isInteger(ref.page)||ref.page<1||ref.page>source.pages) errors.push(`INVALID_PAGE:${r.id}`);
    }
    if(!r.caseIds.length) errors.push(`MISSING_CASE:${r.id}`);
    if(stage!=='inventory'&&(stage==='m3'||r.milestone==='m1')&&r.status!=='verified') errors.push(`UNVERIFIED_RULE:${r.id}`);
  }
  return {errors:[...new Set(errors)]};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const stage=process.argv.find(a=>a.startsWith('--stage='))?.split('=')[1]??'inventory';
  const manifest:RuleManifest={sources:JSON.parse(readFileSync('docs/rules/sources.json','utf8')),requirements:JSON.parse(readFileSync('docs/rules/coverage.json','utf8'))};
  const {errors}=checkRules(manifest,stage);
  console.log(JSON.stringify({stage,requirements:manifest.requirements.length,errors},null,2));
  process.exitCode=errors.length?1:0;
}
