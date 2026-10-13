import {describe,it,expect} from 'vitest';
import {applyAction} from '../src/engine';
import {actionState} from './fixtures/actions';
describe('science rules p10,15',()=>{
 it('sends a scholar to the first permanent slot and crosses power threshold',()=>{const s=actionState();s.players.p1.resources.scholars=1;const r=applyAction(s,'p1',{kind:'scholar',track:0,slot:0});expect(r.ok).toBe(true);if(r.ok){expect(r.state.players.p1.science[0]).toBe(5);expect(r.state.players.p1.resources.power).toEqual([1,11,0]);expect(r.state.shared.scholarSlots[0][0]).toBe('p1');}});
 it('caps before level8 when no city key',()=>{const s=actionState();s.players.p1.resources.scholars=1;s.players.p1.science[0]=6;const r=applyAction(s,'p1',{kind:'scholar',track:0,slot:0});if(!r.ok)throw Error('scholar');expect(r.state.players.p1.science[0]).toBe(7);});
 it('cannot occupy a taken scholar slot',()=>{const s=actionState();s.players.p1.resources.scholars=1;s.shared.scholarSlots[0][0]='p2';expect(applyAction(s,'p1',{kind:'scholar',track:0,slot:0})).toMatchObject({ok:false,error:{code:'SLOT_OCCUPIED'}});});
 it('level12 belongs to only one player',()=>{const s=actionState();s.players.p1.resources.scholars=1;s.players.p1.science[0]=11;s.players.p1.keys=1;s.players.p2.science[0]=12;const r=applyAction(s,'p1',{kind:'scholar',track:0,slot:null});if(!r.ok)throw Error('scholar');expect(r.state.players.p1.science[0]).toBe(11);});
});
