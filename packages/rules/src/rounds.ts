import type {GameState,Player} from './types';
import {ownBuildings,requireRule,gainScholar} from './internal';
import {gainPower} from './actions/power';
import {advanceScience} from './actions/science';
import {queueChoice} from './responses';
import {finishGame} from './scoring';
export function giveIncome(s:GameState){for(const p of Object.values(s.players)){
 const bs=ownBuildings(s,p.seat);const count=(kind:string)=>bs.filter(([,b])=>b.kind===kind&&!b.neutral).length;
 p.resources.tools+=count('workshop');const g=count('guild');p.resources.coins+=2*g+(p.native==='mountain'?2+(g?1:0):0);p.resources.power=gainPower(p.resources.power,[0,1,2,4,6][g]);gainScholar(s,p,count('school')+count('university'));
 if(p.bonus==='coins')p.resources.coins+=6;if(p.bonus==='power'){p.resources.coins+=2;p.resources.power=gainPower(p.resources.power,4);}if(p.bonus==='guild')p.resources.power=gainPower(p.resources.power,3);if(p.bonus==='scholar')gainScholar(s,p,1);if(p.bonus==='school')p.resources.coins+=4;if(p.bonus==='bigbuilding')p.resources.tools++;
 if(p.science[0]>=9)p.resources.coins+=3;if(p.science[1]>=9)p.resources.power=gainPower(p.resources.power,6);if(p.science[2]>=9)p.resources.tools++;if(p.science[3]>=9)gainScholar(s,p,3);
 if(p.palace==='income-power')p.resources.power=gainPower(p.resources.power,8);if(p.palace==='workshop-score')p.resources.power=gainPower(p.resources.power,8);if(p.palace==='city-discount'){p.resources.coins+=2;p.resources.tools++;p.resources.power=gainPower(p.resources.power,2);}
 if(p.competencies.includes('income-vp-coins')){p.vp+=3;p.resources.coins+=2;}if(p.competencies.includes('income-book-power')){p.resources.power=gainPower(p.resources.power,1);queueChoice(s,p.seat,'book',1,['0','1','2','3'],'income');}
}}
export function awardRound(s:GameState,p:Player,event:string,count=1){const tile=s.setup.roundTiles[s.round-1];const trigger:Record<string,[string,number]>={'workshop-law':['workshop',2],'workshop-bank':['workshop',2],'guild-law':['guild',3],'guild-medicine':['guild',3],'school-bank':['school',4],'big-medicine':['big',5],'big-bank':['big',5],'spade-engineering':['spade',2],'science-medicine':['science',1],'city-engineering':['city',5],'advance-engineering':['advance',3],'innovation-law':['innovation',5]};if(trigger[tile]?.[0]===event)p.vp+=trigger[tile][1]*count;if(s.round===6){if(s.setup.finalRoundTile==='workshop'&&event==='workshop')p.vp+=2;if(s.setup.finalRoundTile==='guild'&&event==='guild')p.vp+=3;if(s.setup.finalRoundTile==='school'&&event==='school')p.vp+=4;}}
function roundBonus(s:GameState){const tile=s.setup.roundTiles[s.round-1];const rules:Record<string,[number,number,string,number]>={'workshop-law':[1,3,'scholar',1],'workshop-bank':[0,3,'power',4],'guild-law':[1,3,'book',1],'school-bank':[0,1,'coins',1],'big-medicine':[3,2,'tools',1],'big-bank':[0,2,'tools',1],'spade-engineering':[2,1,'coins',1],'science-medicine':[3,3,'book',1],'advance-engineering':[2,3,'scholar',1],'innovation-law':[1,2,'power',3]};const rule=rules[tile];if(!rule)return;for(const p of Object.values(s.players)){const [track,step,resource,n]=rule;const amount=Math.floor((p.science[track]+(p.faction==='blessed'?3:0))/step)*n;if(resource==='coins')p.resources.coins+=amount;if(resource==='tools')p.resources.tools+=amount;if(resource==='scholar')gainScholar(s,p,amount);if(resource==='power')p.resources.power=gainPower(p.resources.power,amount);if(resource==='book'&&amount)queueChoice(s,p.seat,'book',amount,['0','1','2','3'],'round-science');}}
export function pass(s:GameState,p:Player,bonus?:string){
 if(s.round<6){requireRule(!!bonus&&s.setup.bonusPool.includes(bonus),'INVALID_BONUS');requireRule(!Object.values(s.players).some(x=>x.bonus===bonus),'BONUS_UNAVAILABLE');}
 const bs=ownBuildings(s,p.seat);if(p.bonus==='bigbuilding')p.vp+=4*bs.filter(([,b])=>b.kind==='palace'||b.kind==='university').length;if(p.bonus==='school'){const n=bs.filter(([,b])=>b.kind==='school').length;for(let i=0;i<n;i++)queueChoice(s,p.seat,'science',1,['0','1','2','3'],'pass');}
 if(s.round<6){p.resources.coins+=s.shared.bonusCoins[bonus!]??0;s.shared.bonusCoins[bonus!]=0;p.bonus=bonus!;}
 p.passed=true;p.primaryDone=false;s.passOrder.push(p.seat);
 if(s.passOrder.length===s.turnOrder.length){if(!s.pending.length)completeRound(s);}
 else{let i=s.turnOrder.indexOf(p.seat);do{i=(i+1)%s.turnOrder.length;}while(s.players[s.turnOrder[i]].passed);s.activeSeat=s.turnOrder[i];}
}

export function completeRound(s:GameState){if(s.round===6){finishGame(s);return;}roundBonus(s);s.round++;s.turnOrder=[...s.passOrder];s.passOrder=[];s.shared.usedActions=[];for(const id of s.setup.bonusPool)if(!Object.values(s.players).some(p=>p.bonus===id))s.shared.bonusCoins[id]++;for(const p of Object.values(s.players)){p.passed=false;p.primaryDone=false;p.usedSpecials=[];}s.activeSeat=s.turnOrder[0];giveIncome(s);}
