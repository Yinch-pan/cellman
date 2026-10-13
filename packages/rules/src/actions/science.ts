import type {Discipline,GameState,Player} from '../types';
import {requireRule} from '../internal';
import {gainPower} from './power';
export function advanceScience(s:GameState,p:Player,track:Discipline,amount:number){requireRule(Number.isInteger(track)&&track>=0&&track<4,'INVALID_TRACK');const before=p.science[track];let next=Math.min(12,before+amount);if(before<8&&next>=8){if(p.keysUsed>=p.keys)next=7;else p.keysUsed++;}if(next===12&&Object.values(s.players).some(other=>other.seat!==p.seat&&other.science[track]===12))next=11;p.science[track]=next;for(const [level,power] of [[3,1],[5,2],[7,2],[12,3]])if(before<level&&next>=level)p.resources.power=gainPower(p.resources.power,power);return next-before;}
