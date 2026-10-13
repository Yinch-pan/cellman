import pg from 'pg';
import {readFile} from 'node:fs/promises';
export const {Pool}=pg;
export type Database=pg.Pool;
export async function migrate(db:Database){await db.query(await readFile(new URL('../../migrations/001-initial.sql',import.meta.url),'utf8'));}
export async function transaction<T>(db:Database,run:(client:pg.PoolClient)=>Promise<T>):Promise<T>{const c=await db.connect();try{await c.query('BEGIN');const result=await run(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
