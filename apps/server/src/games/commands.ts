import type {Database} from '../db/pool';
import {transaction} from '../db/pool';
import {assertApi} from '../errors';
import {digest} from '../auth/password';
import {applyAction,getWaitingSeats} from '../../../../packages/rules/src/engine';
import {RULES_VERSION} from '../../../../packages/rules/src/state';
import type {GameState} from '../../../../packages/rules/src/types';
import type {CommandEnvelope} from '../../../../packages/contracts/src/game';
export async function getGame(db:Database,actor:string,id:string){const {rows}=await db.query('SELECT g.state,m.seat FROM games g JOIN game_members m ON m.game_id=g.id WHERE g.id=$1 AND m.user_id=$2',[id,actor]);assertApi(rows[0],'FORBIDDEN',403);return rows[0] as {state:GameState;seat:string};}
export async function submitCommand(db:Database,actor:string,id:string,command:CommandEnvelope,injectFailure?:()=>void){return transaction(db,async c=>{
 const {rows}=await c.query('SELECT g.* FROM games g WHERE id=$1 FOR UPDATE',[id]);const member=await c.query('SELECT seat FROM game_members WHERE game_id=$1 AND user_id=$2',[id,actor]);assertApi(rows[0]&&member.rows[0],'FORBIDDEN',403);
 const hash=digest(JSON.stringify(command));const prior=await c.query('SELECT payload_hash,result FROM game_commands WHERE game_id=$1 AND actor_id=$2 AND command_id=$3',[id,actor,command.commandId]);if(prior.rows[0]){assertApi(prior.rows[0].payload_hash===hash,'COMMAND_REUSE',409);return prior.rows[0].result;}
 assertApi(rows[0].revision===command.expectedRevision,'REVISION_CONFLICT',409);assertApi(rows[0].rules_version===RULES_VERSION,'RULESET_UNAVAILABLE',503);
 const result=applyAction(rows[0].state,member.rows[0].seat,command.action);assertApi(result.ok,result.ok?'':result.error.code,400);const revision=rows[0].revision+1;result.state.revision=revision;
 const response={commandId:command.commandId,revision,events:result.events,waitingSeats:getWaitingSeats(result.state)};
 await c.query('UPDATE games SET state=$1,revision=$2,updated_at=now() WHERE id=$3',[JSON.stringify(result.state),revision,id]);injectFailure?.();
 await c.query('INSERT INTO game_events(game_id,revision,actor_id,events) VALUES($1,$2,$3,$4)',[id,revision,actor,JSON.stringify(result.events)]);
 await c.query('INSERT INTO game_commands(game_id,actor_id,command_id,payload_hash,result) VALUES($1,$2,$3,$4,$5)',[id,actor,command.commandId,hash,JSON.stringify(response)]);return response;
 });}
