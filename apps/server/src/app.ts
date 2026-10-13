import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import {z} from 'zod';
import {EventEmitter} from 'node:events';
import type {Database} from './db/pool';
import {ApiError,assertApi} from './errors';
import {register,login,authenticate,logout,recover} from './auth/sessions';
import {createRoom,joinRoom,roomView,setReady,startRoom,leaveRoom} from './rooms/service';
import {getGame,submitCommand} from './games/commands';
import {commandSchema} from '../../../packages/contracts/src/game';
import {applyAction,getLegalActions,getWaitingSeats} from '../../../packages/rules/src/engine';
import {officialLarge} from '../../../packages/rules/src/map';
declare module 'fastify'{interface FastifyRequest{user:{id:string;name:string;csrf:string}|null}}
export function createApp(db:Database,origin='http://127.0.0.1:5173',production=false){
 const app=Fastify({logger:false,bodyLimit:32768});const events=new EventEmitter();events.setMaxListeners(1000);
 app.register(cookie);app.register(rateLimit,{max:300,timeWindow:'1 minute'});app.decorateRequest('user',null);
 app.setErrorHandler((e,_req,reply)=>{if(e instanceof ApiError)return reply.code(e.status).send({error:e.code});if(e instanceof z.ZodError)return reply.code(400).send({error:'INVALID_INPUT'});if((e as {statusCode?:number}).statusCode===429)return reply.code(429).send({error:'RATE_LIMIT'});app.log.error({message:(e as Error).message},'Request failed');return reply.code(500).send({error:'SERVER_ERROR'});});
 app.addHook('preHandler',async(req)=>{
  req.user=await authenticate(db,req.cookies.session);
  if(['POST','PUT','DELETE','PATCH'].includes(req.method)){
   assertApi(req.headers.origin===origin,'ORIGIN_REJECTED',403);
   if(req.user&&!['/api/auth/login','/api/auth/register','/api/auth/recover'].includes(req.url))assertApi(req.headers['x-csrf-token']===req.user.csrf,'CSRF_REJECTED',403);
  }
  if(req.url.startsWith('/api/')&&!req.url.startsWith('/api/auth/')&&req.url!=='/api/health')assertApi(req.user,'UNAUTHENTICATED',401);
 });
 const credentials=z.object({username:z.string().min(3).max(24),password:z.string().min(1).max(512),displayName:z.string().min(1).max(30).optional()});
 const authLimit={config:{rateLimit:{max:12,timeWindow:'1 minute'}}};
 app.get('/api/health',async()=>({ok:true,mode:'development-preview'}));
 app.get('/api/auth/me',async req=>req.user?{user:{id:req.user.id,name:req.user.name},csrf:req.user.csrf}:{user:null});
 app.post('/api/auth/register',authLimit,async req=>register(db,credentials.parse(req.body)));
 app.post('/api/auth/login',authLimit,async(req,reply)=>{const data=credentials.parse(req.body);const result=await login(db,data.username,data.password);reply.setCookie('session',result.session,{path:'/',httpOnly:true,sameSite:'lax',secure:production,maxAge:30*24*60*60});return {user:result.user,csrf:result.csrf};});
 app.post('/api/auth/logout',async(req,reply)=>{if(req.cookies.session)await logout(db,req.cookies.session);reply.clearCookie('session',{path:'/'});return {ok:true};});
 app.post('/api/auth/recover',authLimit,async req=>{const input=credentials.extend({recoveryCode:z.string().max(100)}).parse(req.body);return recover(db,input.username,input.recoveryCode,input.password);});
 app.get('/api/rooms',async req=>{const {rows}=await db.query("SELECT r.id,r.visibility,r.capacity,r.status,a.display_name AS host,COUNT(s.user_id)::int AS count FROM rooms r JOIN accounts a ON a.id=r.host_id LEFT JOIN room_seats s ON s.room_id=r.id WHERE r.status='waiting' AND (r.visibility='public' OR EXISTS(SELECT 1 FROM room_seats own WHERE own.room_id=r.id AND own.user_id=$1)) GROUP BY r.id,a.display_name ORDER BY r.created_at DESC LIMIT 100",[req.user!.id]);return rows;});
 app.post('/api/rooms',async req=>{const input=z.object({visibility:z.enum(['public','private']),seats:z.number().int().min(2).max(5)}).parse(req.body);return createRoom(db,req.user!.id,input);});
 app.get<{Params:{id:string}}>('/api/rooms/:id',async req=>roomView(db,req.user!.id,req.params.id));
 app.post<{Params:{id:string}}>('/api/rooms/:id/join',async req=>{const {inviteToken}=z.object({inviteToken:z.string().max(100).optional()}).parse(req.body);return joinRoom(db,req.user!.id,req.params.id,inviteToken);});
 app.post<{Params:{id:string}}>('/api/rooms/:id/ready',async req=>setReady(db,req.user!.id,req.params.id,z.object({ready:z.boolean()}).parse(req.body).ready));
 app.post<{Params:{id:string}}>('/api/rooms/:id/start',async req=>startRoom(db,req.user!.id,req.params.id));
 app.post<{Params:{id:string}}>('/api/rooms/:id/leave',async req=>{await leaveRoom(db,req.user!.id,req.params.id);return {ok:true};});
 app.get('/api/me/games',async req=>{const {rows}=await db.query('SELECT g.id,g.state,m.seat FROM games g JOIN game_members m ON m.game_id=g.id WHERE m.user_id=$1 ORDER BY g.updated_at DESC LIMIT 100',[req.user!.id]);return rows.map(r=>({id:r.id,round:r.state.round,status:r.state.status,revision:r.state.revision,needAction:getWaitingSeats(r.state).includes(r.seat),names:Object.values(r.state.players as Record<string,{name:string}>).map(p=>p.name)}));});
 app.get<{Params:{id:string}}>('/api/games/:id',async req=>{const {state,seat}=await getGame(db,req.user!.id,req.params.id);return {state,seat,map:officialLarge,waitingSeats:getWaitingSeats(state),legalActions:getLegalActions(state,seat)};});
 app.post<{Params:{id:string}}>('/api/games/:id/preview',async req=>{const command=commandSchema.parse(req.body);const {state,seat}=await getGame(db,req.user!.id,req.params.id);assertApi(state.revision===command.expectedRevision,'REVISION_CONFLICT',409);const result=applyAction(state,seat,command.action);assertApi(result.ok,result.ok?'':result.error.code);return {baseRevision:state.revision,state:result.state,events:result.events};});
 app.post<{Params:{id:string}}>('/api/games/:id/commands',async req=>{const command=commandSchema.parse(req.body);const result=await submitCommand(db,req.user!.id,req.params.id,command);events.emit(req.params.id,result.revision);return result;});
 app.get<{Params:{id:string};Querystring:{after?:string}}>('/api/games/:id/history',async req=>{await getGame(db,req.user!.id,req.params.id);const after=z.coerce.number().int().nonnegative().parse(req.query.after??0);return (await db.query('SELECT revision,events,created_at FROM game_events WHERE game_id=$1 AND revision>$2 ORDER BY revision LIMIT 100',[req.params.id,after])).rows;});
 app.get<{Params:{id:string}}>('/api/games/:id/events',async(req,reply)=>{
  const {state}=await getGame(db,req.user!.id,req.params.id);reply.hijack();reply.raw.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});
  const send=(revision:number)=>reply.raw.write(`data: ${JSON.stringify({gameId:req.params.id,revision})}\n\n`);send(state.revision);events.on(req.params.id,send);
  const timer=setInterval(async()=>{try{if(!await authenticate(db,req.cookies.session)){reply.raw.end();return;}reply.raw.write(': heartbeat\n\n');}catch{reply.raw.end();}},15000);
  reply.raw.on('close',()=>{clearInterval(timer);events.off(req.params.id,send);});
 });
 return app;
}
