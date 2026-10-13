import type {GameState,Player,RuleEvent} from './types';
export class RuleViolation extends Error{constructor(public code:string){super(code);}}
export function requireRule(condition:unknown,code:string):asserts condition{if(!condition)throw new RuleViolation(code);}
export function integer(n:number,min=0){requireRule(Number.isSafeInteger(n)&&n>=min,'INVALID_COUNT');}
export function pay(p:Player,cost:{coins?:number;tools?:number;scholars?:number}){for(const [key,amount] of Object.entries(cost)){const k=key as 'coins'|'tools'|'scholars';requireRule(p.resources[k]>=amount,'INSUFFICIENT_RESOURCES');p.resources[k]-=amount;}}
export function note(events:RuleEvent[],seat:string,kind:string,text:string,details?:Record<string,unknown>){events.push({kind,seat,text,...(details?{details}:{})});}
export const ownBuildings=(s:GameState,seat:string)=>Object.entries(s.board.buildings).filter(([,b])=>b.seat===seat);
export function gainScholar(s:GameState,p:Player,n:number){const committed=s.shared.scholarSlots.flat().filter(id=>id===p.seat).length;p.resources.scholars=Math.min(7-committed,p.resources.scholars+n);}
