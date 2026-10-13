import {z} from 'zod';
export const terrain=z.enum(['desert','plains','swamp','lake','forest','mountain','wasteland']);
const track=z.union([z.literal(0),z.literal(1),z.literal(2),z.literal(3)]);
const count=z.number().int().positive().max(999);
const hex=z.string().regex(/^[A-I](?:[1-9]|1[0-3])$/);
export const actionSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('place'),hex}),
 z.object({kind:z.literal('terraform'),hex,terrain,build:z.boolean()}),
 z.object({kind:z.literal('upgrade'),hex,to:z.enum(['workshop','guild','school','palace','university','tower','monument']),palace:z.string().max(80).optional()}),
 z.object({kind:z.literal('convert'),from:z.enum(['power','scholar','tool','book']),to:z.enum(['coin','tool','scholar','book']),count,color:track.optional()}),
 z.object({kind:z.literal('burn'),count}),
 z.object({kind:z.literal('scholar'),track,slot:z.number().int().min(0).max(3).nullable()}),
 z.object({kind:z.literal('advance'),track:z.enum(['sailing','terraform'])}),
 z.object({kind:z.literal('powerAction'),id:z.string().max(80),hex:hex.optional(),terrain:terrain.optional(),build:z.boolean().optional()}),
 z.object({kind:z.literal('innovation'),id:z.string().max(80),books:z.tuple([z.number().int().nonnegative(),z.number().int().nonnegative(),z.number().int().nonnegative(),z.number().int().nonnegative()])}),
 z.object({kind:z.literal('pass'),bonus:z.string().max(80).optional()}),
 z.object({kind:z.literal('endTurn')}),
 z.object({kind:z.literal('respond'),choiceId:z.string().max(150),option:z.string().max(80)}),
 z.object({kind:z.literal('setLeech'),enabled:z.boolean(),maxVpCost:z.number().int().min(0).max(999)})
]);
export const commandSchema=z.object({commandId:z.string().uuid(),expectedRevision:z.number().int().nonnegative(),action:actionSchema});
export type CommandEnvelope=z.infer<typeof commandSchema>;
export type UserId=string;
