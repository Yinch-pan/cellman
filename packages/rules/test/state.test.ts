import {describe,it,expect} from 'vitest';
import {createGame,validateState} from '../src/state';
import {sampleSetup} from './fixtures/setup';
describe('serializable authoritative state',()=>{
 it('round trips without closures, clocks or random state',()=>{const s=createGame(sampleSetup());expect(JSON.parse(JSON.stringify(s))).toEqual(s);expect(validateState(s)).toEqual([]);});
 it('begins with official power and initial resources',()=>{const s=createGame(sampleSetup());expect(s.players.p1.resources.power).toEqual([4,8,0]);expect(s.players.p1.resources.tools).toBe(3);expect(s.players.p1.vp).toBe(20);expect(s.phase).toBe('placement');});
 it('rejects negative and fractional resources',()=>{const s=createGame(sampleSetup());s.players.p1.resources.coins=-1;expect(validateState(s)).toContain('NEGATIVE_RESOURCE');s.players.p1.resources.coins=1.5;expect(validateState(s)).toContain('NONINTEGER_RESOURCE');});
 it('rejects duplicate homelands and unsupported maps',()=>{const setup=sampleSetup();setup.players[1].native='forest';expect(()=>createGame(setup)).toThrow('DUPLICATE_HOMELAND');expect(()=>createGame({...sampleSetup(),mapId:'unverified-small'})).toThrow('UNSUPPORTED_MAP');});
});
