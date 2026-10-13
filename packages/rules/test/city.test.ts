import {describe,it,expect} from 'vitest';
import {applyAction} from '../src/engine';
import {actionState} from './fixtures/actions';
describe('city founding p16 and city tile p23',()=>{
 it('requires both four buildings and seven power; claims only once',()=>{const s=actionState();s.players.p1.resources.tools=5;s.board.buildings={A4:{seat:'p1',kind:'workshop'},A5:{seat:'p1',kind:'guild'},A6:{seat:'p1',kind:'school'},B5:{seat:'p1',kind:'workshop'}};const r=applyAction(s,'p1',{kind:'upgrade',hex:'A4',to:'guild'});expect(r.ok).toBe(true);if(!r.ok)return;const c=r.state.pending.find(c=>c.kind==='city');expect(c).toBeDefined();const done=applyAction(r.state,'p1',{kind:'respond',choiceId:c!.id,option:'coins'});expect(done.ok).toBe(true);if(done.ok){expect(done.state.players.p1.keys).toBe(1);expect(done.state.players.p1.vp).toBe(26);expect(done.state.shared.cities.coins).toBe(2);expect(new Set(Object.values(done.state.board.buildings).map(b=>b.cityId)).size).toBe(1);}});
 it('three buildings without a university do not qualify',()=>{const s=actionState();s.players.p1.resources.tools=8;s.board.buildings={A4:{seat:'p1',kind:'workshop'},A5:{seat:'p1',kind:'palace'},B5:{seat:'p1',kind:'school'}};const r=applyAction(s,'p1',{kind:'upgrade',hex:'A4',to:'guild'});if(!r.ok)throw Error('upgrade');expect(r.state.pending.filter(c=>c.kind==='city')).toEqual([]);});
});
