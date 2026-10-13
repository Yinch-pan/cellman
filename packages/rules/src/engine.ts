import type {GameState,GameAction,SeatId,Transition,RuleEvent,ActionOption} from './types';
import {RuleViolation,requireRule,pay,note,integer} from './internal';
import {burnPower} from './actions/power';
import {advanceScience} from './actions/science';
import {convert} from './actions/convert';
import {terraform,upgrade} from './actions/build';
import {acceptLeech,autoLeech,queueChoice} from './responses';
import {officialLarge} from './map';
import {giveIncome,pass,awardRound,completeRound} from './rounds';
import {findCities,takeCity} from './actions/city';
import {publicPower,innovate} from './actions/public';
export {gainPower} from './actions/power';
export const getWaitingSeats=(s:GameState):SeatId[]=>s.status==='finished'?[]:s.pending.length?[...new Set(s.pending.map(c=>c.seat))]:[s.activeSeat];
export function getLegalActions(s:GameState,seat:SeatId):ActionOption[]{if(!s.players[seat]||s.status==='finished')return [];if(s.pending.some(c=>c.seat===seat))return [{kind:'respond',label:'处理待响应'}];if(s.pending.length||s.activeSeat!==seat)return [];if(s.phase==='placement')return [{kind:'place',label:'放置起始工坊'}];const free:ActionOption[]=[{kind:'convert',label:'资源转换'},{kind:'burn',label:'燃烧魔力'}];return [...free,...(s.players[seat].primaryDone?[{kind:'endTurn' as const,label:'结束回合'}]:[{kind:'terraform' as const,label:'改造与建造'},{kind:'upgrade' as const,label:'升级建筑'},{kind:'scholar' as const,label:'派遣学者'},{kind:'advance' as const,label:'推进技术'},{kind:'pass' as const,label:'结束本轮'}])];}
export function applyAction(state:GameState,seat:SeatId,action:GameAction):Transition{
 const s=structuredClone(state);const events:RuleEvent[]=[];
 try{
  const p=s.players[seat];requireRule(p,'UNKNOWN_SEAT');requireRule(s.status!=='finished','GAME_FINISHED');
  if(action.kind==='setLeech'){integer(action.maxVpCost);requireRule(action.maxVpCost<=999&&typeof action.enabled==='boolean','INVALID_POLICY');p.leechPolicy={enabled:action.enabled,maxVpCost:action.maxVpCost};autoLeech(s,events);return {ok:true,state:s,events};}
  if(action.kind==='respond'){
   const i=s.pending.findIndex(c=>c.id===action.choiceId);requireRule(i>=0,'STALE_CHOICE');const c=s.pending[i];requireRule(c.seat===seat,'WRONG_RESPONDER');requireRule(c.options.includes(action.option),'INVALID_OPTION');
   if(c.kind==='leech'&&action.option==='accept')acceptLeech(p,c.amount,events);
   else if(c.kind==='city')takeCity(s,p,action.option);
   else if(c.kind==='book')p.resources.books[Number(action.option) as 0|1|2|3]+=c.amount;
   else if(c.kind==='science')advanceScience(s,p,Number(action.option) as 0|1|2|3,c.amount);
   else if(c.kind==='competency'){p.competencies.push(action.option);if(action.option==='immediate-resources'){p.resources.tools++;p.resources.coins+=2;p.vp+=5;}queueChoice(s,seat,'science',3,['0','1','2','3'],'competency');}
   s.pending.splice(i,1);if(!s.pending.length&&s.passOrder.length===s.turnOrder.length)completeRound(s);note(events,seat,'response',`${p.name} 已处理选择`);return {ok:true,state:s,events};
  }
  requireRule(s.activeSeat===seat,'NOT_YOUR_TURN');requireRule(!s.pending.length,'PENDING_CHOICES');
  if(s.phase==='placement'){requireRule(action.kind==='place','INITIAL_PLACEMENT_REQUIRED');const h=officialLarge.hexes[action.hex];requireRule(h?.terrain===p.native,'NOT_NATIVE_TERRAIN');requireRule(!s.board.buildings[action.hex],'OCCUPIED');s.board.buildings[action.hex]={seat,kind:'workshop'};s.placementIndex++;if(s.placementIndex===s.placementOrder.length){s.phase='actions';s.activeSeat=s.turnOrder[0];giveIncome(s);}else s.activeSeat=s.placementOrder[s.placementIndex];note(events,seat,'place',`${p.name} 放置起始工坊`);return {ok:true,state:s,events};}
  if(action.kind==='convert')convert(s,p,action);
  else if(action.kind==='burn')burnPower(p,action.count);
  else if(action.kind==='endTurn'){requireRule(p.primaryDone,'PRIMARY_REQUIRED');p.primaryDone=false;let next=s.turnOrder.indexOf(seat);do{next=(next+1)%s.turnOrder.length;}while(s.players[s.turnOrder[next]].passed);s.activeSeat=s.turnOrder[next];}
  else{
   requireRule(!p.primaryDone,'PRIMARY_ALREADY_USED');
   if(action.kind==='terraform'){const result=terraform(s,p,action);awardRound(s,p,'spade',result.spades);if(result.built){awardRound(s,p,'workshop');if(p.palace==='workshop-score')p.vp+=2;}findCities(s,p);}
   else if(action.kind==='upgrade'){upgrade(s,p,action);awardRound(s,p,['palace','university'].includes(action.to)?'big':action.to);if(action.to==='guild'&&p.bonus==='guild')p.vp+=3;findCities(s,p);}
   else if(action.kind==='scholar'){requireRule(Number.isInteger(action.track)&&action.track>=0&&action.track<4,'INVALID_TRACK');pay(p,{scholars:1});let gain=1;if(action.slot!==null){requireRule(Number.isInteger(action.slot)&&action.slot>=0&&action.slot<4,'INVALID_SLOT');requireRule(s.shared.scholarSlots[action.track][action.slot]===null,'SLOT_OCCUPIED');s.shared.scholarSlots[action.track][action.slot]=seat;gain=action.slot===0?3:2;}advanceScience(s,p,action.track,gain);}
   else if(action.kind==='advance'){if(action.track==='sailing'){requireRule(p.sailing<3,'TRACK_MAX');pay(p,{scholars:1,coins:4});p.sailing++;if(p.sailing===2)queueChoice(s,seat,'book',2,['0','1','2','3'],'sailing');else p.vp+=p.sailing===1?2:4;}else{requireRule(p.terraformLevel<2,'TRACK_MAX');pay(p,{tools:1,coins:p.native==='plains'?1:5,scholars:1});p.terraformLevel++;if(p.terraformLevel===1)queueChoice(s,seat,'book',2,['0','1','2','3'],'terraform');else p.vp+=6;}}
   else if(action.kind==='powerAction')publicPower(s,p,action);
   else if(action.kind==='innovation')innovate(s,p,action);
   else if(action.kind==='pass')pass(s,p,action.bonus);
   else requireRule(false,'UNSUPPORTED_ACTION');
   if(action.kind!=='pass')p.primaryDone=true;
  }
  autoLeech(s,events);note(events,seat,action.kind,`${p.name}：${action.kind}`);return {ok:true,state:s,events};
 }catch(e){if(e instanceof RuleViolation)return {ok:false,error:{code:e.code,message:e.message}};throw e;}
}
