import {describe,it,expect} from 'vitest';
import {applyAction} from '../src/engine';
import {actionState} from './fixtures/actions';
import type {GameAction} from '../src/types';
function run(a:GameAction,change?:(s:ReturnType<typeof actionState>)=>void){const s=actionState();change?.(s);const before=JSON.stringify(s);const result=applyAction(s,'p1',a);expect(JSON.stringify(s)).toBe(before);return result;}
describe('atomic building actions, rules p11–13',()=>{
 it('pays tools for shortest terrain change and workshop separately',()=>{const r=run({kind:'terraform',hex:'C1',terrain:'forest',build:true},s=>{s.board.buildings={B1:{seat:'p1',kind:'workshop'}};s.players.p1.resources.tools=10;});expect(r.ok).toBe(true);if(r.ok){expect(r.state.players.p1.resources.tools).toBe(3);expect(r.state.players.p1.resources.coins).toBe(13);expect(r.state.board.buildings.C1.kind).toBe('workshop');expect(r.state.players.p1.primaryDone).toBe(true);}});
 it('applies neighbor discount and queues leech from receiver buildings',()=>{const r=run({kind:'upgrade',hex:'A1',to:'guild'});expect(r.ok).toBe(true);if(r.ok){expect(r.state.players.p1.resources).toMatchObject({tools:1,coins:12});expect(r.state.pending).toMatchObject([{seat:'p2',kind:'leech',amount:2}]);}});
 it.each<[GameAction,string]>([[{kind:'upgrade',hex:'A1',to:'university'},'INVALID_UPGRADE'],[{kind:'terraform',hex:'A3',terrain:'forest',build:true},'OUT_OF_REACH'],[{kind:'terraform',hex:'A1',terrain:'forest',build:true},'OCCUPIED']])('rejects invalid actions without mutation', (a,code)=>{expect(run(a)).toMatchObject({ok:false,error:{code}});});
 it('rolls back entire action if coins insufficient after terraforming',()=>expect(run({kind:'terraform',hex:'C1',terrain:'forest',build:true},s=>{s.board.buildings={B1:{seat:'p1',kind:'workshop'}};s.players.p1.resources.tools=10;s.players.p1.resources.coins=0;})).toMatchObject({ok:false,error:{code:'INSUFFICIENT_RESOURCES'}}));
 it('rejects out of turn actions',()=>expect(applyAction(actionState(),'p2',{kind:'endTurn'})).toMatchObject({ok:false,error:{code:'NOT_YOUR_TURN'}}));
 it('allows free conversion after a primary action',()=>{const r=run({kind:'convert',from:'power',to:'coin',count:2},s=>{s.players.p1.primaryDone=true;s.players.p1.resources.power=[0,0,12];});expect(r.ok).toBe(true);if(r.ok){expect(r.state.players.p1.resources.coins).toBe(17);expect(r.state.players.p1.resources.power).toEqual([2,0,10]);}});
 it('rejects fractional conversions',()=>expect(run({kind:'convert',from:'tool',to:'coin',count:0.5})).toMatchObject({ok:false,error:{code:'INVALID_COUNT'}}));
 it('requires endTurn after primary and permits only one primary',()=>expect(run({kind:'upgrade',hex:'A1',to:'guild'},s=>s.players.p1.primaryDone=true)).toMatchObject({ok:false,error:{code:'PRIMARY_ALREADY_USED'}}));
});
