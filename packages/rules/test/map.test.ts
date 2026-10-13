import {describe,it,expect} from 'vitest';
import {officialLarge,adjacent,reachable,terrainDistance} from '../src/map';
describe('official large map (rulebook p2,9)',()=>{
 it('transcribes fixed source landmarks',()=>{expect(officialLarge.hexes.A1.terrain).toBe('forest');expect(officialLarge.hexes.A3.terrain).toBe('lake');expect(officialLarge.hexes.I13.terrain).toBe('plains');});
 it('separates adjacency from river reach',()=>{expect(adjacent(officialLarge,'A1','B1')).toBe(true);expect(adjacent(officialLarge,'A1','C1')).toBe(false);expect(adjacent(officialLarge,'B1','C2')).toBe(true);expect(reachable(officialLarge,['A1'],'A3',0,[])).toBe(false);expect(reachable(officialLarge,['A1'],'A3',1,[])).toBe(true);});
 it('uses symmetric neighbors without self edges',()=>{for(const [id,ns] of Object.entries(officialLarge.neighbors))for(const n of ns){expect(n).not.toBe(id);expect(officialLarge.neighbors[n]).toContain(id);}});
 it('takes the shortest terrain cycle',()=>{expect(terrainDistance('desert','wasteland')).toBe(1);expect(terrainDistance('desert','forest')).toBe(3);});
});
