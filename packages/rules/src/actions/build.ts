import type {GameState,Player,GameAction,BuildingKind} from '../types';
import {requireRule,pay,ownBuildings} from '../internal';
import {officialLarge,reachable,terrainDistance,connected} from '../map';
import {offerLeech,queueChoice} from '../responses';
const limits:Partial<Record<BuildingKind,number>>={workshop:9,guild:4,school:3,palace:1,university:1};
export function checkSupply(s:GameState,p:Player,to:BuildingKind){requireRule(ownBuildings(s,p.seat).filter(([,b])=>b.kind===to&&!b.neutral).length<(limits[to]??0),'NO_BUILDING_SUPPLY');}
export function terraform(s:GameState,p:Player,a:Extract<GameAction,{kind:'terraform'}>,freeSpades=0){const hex=officialLarge.hexes[a.hex];requireRule(hex&&hex.terrain!=='river','INVALID_HEX');requireRule(!s.board.buildings[a.hex],'OCCUPIED');requireRule(reachable(officialLarge,ownBuildings(s,p.seat).map(([id])=>id),a.hex,p.sailing,s.board.bridges,p.seat),'OUT_OF_REACH');const current=s.board.terrain[a.hex]??hex.terrain;const total=terrainDistance(current,p.native);const used=terrainDistance(current,a.terrain);requireRule(used+terrainDistance(a.terrain,p.native)===total,'INVALID_TERRAFORM');requireRule(used>0||a.build,'EMPTY_ACTION');requireRule(!a.build||a.terrain===p.native,'NOT_NATIVE_TERRAIN');pay(p,{tools:Math.max(0,used-freeSpades)*(3-p.terraformLevel)});s.board.terrain[a.hex]=a.terrain;
 if(p.faction==='goblins')p.resources.coins+=used*2;
 if(a.build){checkSupply(s,p,'workshop');pay(p,{tools:1,coins:2});s.board.buildings[a.hex]={seat:p.seat,kind:'workshop'};offerLeech(s,p.seat,a.hex);if(p.faction==='navigators'&&officialLarge.neighbors[a.hex].some(n=>officialLarge.hexes[n].terrain==='river')){p.vp+=2;p.resources.coins++;}}
 return {spades:used,built:a.build};
}
export function upgrade(s:GameState,p:Player,a:Extract<GameAction,{kind:'upgrade'}>){const b=s.board.buildings[a.hex];requireRule(b?.seat===p.seat,'NOT_YOUR_BUILDING');requireRule(!b.neutral,'NEUTRAL_BUILDING');const paths:Partial<Record<BuildingKind,BuildingKind[]>>={workshop:['guild'],guild:['school','palace'],school:['university']};requireRule(paths[b.kind]?.includes(a.to),'INVALID_UPGRADE');checkSupply(s,p,a.to);
 const neighbor=Object.entries(s.board.buildings).some(([id,b])=>b.seat!==p.seat&&connected(officialLarge,id,a.hex,s.board.bridges,p.seat));
 const costs={guild:{tools:2,coins:neighbor?3:6},school:{tools:3,coins:5},palace:{tools:4,coins:6},university:{tools:5,coins:8}};
 pay(p,costs[a.to as keyof typeof costs]);
 if(a.to==='palace'){requireRule(!!a.palace&&s.shared.palaces.includes(a.palace),'INVALID_PALACE');requireRule(['income-power','workshop-score','city-discount'].includes(a.palace),'UNSUPPORTED_ABILITY');p.palace=a.palace;s.shared.palaces=s.shared.palaces.filter(id=>id!==a.palace);}
 b.kind=a.to;
 if(a.to==='school'||a.to==='university')queueChoice(s,p.seat,'competency',1,['income-vp-coins','income-book-power','immediate-resources'].filter(id=>!p.competencies.includes(id)),'upgrade');
 offerLeech(s,p.seat,a.hex);
}
