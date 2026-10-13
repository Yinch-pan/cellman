import {describe,it,expect} from 'vitest';
import {applyAction} from '../src/engine';
import {actionState} from './fixtures/actions';
import {rankPoints,finishGame} from '../src/scoring';
import {giveIncome} from '../src/rounds';
describe('round lifecycle and scoring, rules p10,17–18',()=>{
 it('pools occupied ranks on ties and floors shares',()=>{expect(rankPoints({a:8,b:8,c:4},[18,12,6])).toEqual({a:15,b:15,c:6});expect(rankPoints({a:0,b:0,c:2},[8,4,2],true)).toEqual({a:0,b:0,c:8});});
 it('income counts uncovered buildings and science9 thresholds',()=>{const s=actionState();s.board.buildings={A1:{seat:'p1',kind:'workshop'},B1:{seat:'p1',kind:'guild'}};s.players.p1.science=[9,9,9,9];giveIncome(s);expect(s.players.p1.resources).toMatchObject({coins:26,tools:5,scholars:3});});
 it('all passes begin next round exactly once with pass order',()=>{let s=actionState();for(const [seat,bonus] of [['p1','scholar'],['p2','coins'],['p3','power']]){const r=applyAction(s,seat,{kind:'pass',bonus});expect(r.ok).toBe(true);if(r.ok)s=r.state;}expect(s.round).toBe(2);expect(s.passOrder).toEqual([]);expect(s.activeSeat).toBe('p1');expect(s.players.p1.resources.scholars).toBe(2);});
 it('round6 ends without selecting a new bonus or granting income',()=>{let s=actionState();s.round=6;for(const seat of ['p1','p2','p3']){const r=applyAction(s,seat,{kind:'pass'});expect(r.ok).toBe(true);if(r.ok)s=r.state;}expect(s.status).toBe('finished');expect(s.round).toBe(6);expect(s.scores).toHaveLength(3);expect(applyAction(s,'p1',{kind:'burn',count:1})).toMatchObject({ok:false,error:{code:'GAME_FINISHED'}});});
 it('endgame coins include convertible tools books scholars and power',()=>{const s=actionState();s.players.p1.resources={coins:1,tools:1,scholars:1,books:[1,0,0,0],power:[0,2,0]};finishGame(s);expect(s.scores.find(x=>x.seat==='p1')!.items.find(x=>x.reason==='剩余资源')!.points).toBe(1);});
});

