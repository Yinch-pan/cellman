import type {Player} from '../types';
import {requireRule,integer} from '../internal';
export function gainPower(bowls:[number,number,number],amount:number):[number,number,number]{const b:[number,number,number]=[...bowls];const first=Math.min(b[0],amount);b[0]-=first;b[1]+=first;const second=Math.min(b[1],amount-first);b[1]-=second;b[2]+=second;return b;}
export function spendPower(p:Player,amount:number){requireRule(p.resources.power[2]>=amount,'INSUFFICIENT_POWER');p.resources.power[2]-=amount;p.resources.power[0]+=amount;}
export function burnPower(p:Player,count:number){integer(count,1);requireRule(p.resources.power[1]>=count*2,'INSUFFICIENT_POWER');p.resources.power[1]-=count*2;p.resources.power[2]+=count;}
