import { describe, expect, it } from 'vitest';
import { checkRules, type RuleManifest } from './check-rules';
const categories = ['setup','map','actions','power','science','abilities','cities','rounds','scoring','playerCounts'];
const valid = ():RuleManifest => ({sources:[{id:'rules',url:'https://example.org/rules.pdf',edition:'1.1',pages:24,sha256:'a'.repeat(64)}],requirements:categories.map(category=>({id:category,category,sourceRefs:[{sourceId:'rules',page:1}],caseIds:[`${category}-normal`],milestone:'m1',status:'specified'}))});
describe('rule evidence checks',()=>{
  it('accepts referenced requirements without claiming implementation',()=>expect(checkRules(valid(),'inventory').errors).toEqual([]));
  it('rejects nonexistent source references',()=>{const m=valid();m.sources=[];expect(checkRules(m,'inventory').errors).toContain('MISSING_SOURCE:setup');});
  it('rejects an absent required category',()=>{const m=valid();m.requirements=m.requirements.filter(r=>r.category!=='power');expect(checkRules(m,'inventory').errors).toContain('MISSING_CATEGORY:power');});
  it('rejects a page outside the source document',()=>{const m=valid();m.requirements[0].sourceRefs[0].page=25;expect(checkRules(m,'inventory').errors).toContain('INVALID_PAGE:setup');});
  it('cannot call specified rules a finished milestone',()=>expect(checkRules(valid(),'m1').errors).toContain('UNVERIFIED_RULE:setup'));
  it('rejects duplicate IDs and missing cases',()=>{const m=valid();m.requirements.push({...m.requirements[0],caseIds:[]});const e=checkRules(m,'inventory').errors;expect(e).toContain('DUPLICATE_ID:setup');expect(e).toContain('MISSING_CASE:setup');});
});
