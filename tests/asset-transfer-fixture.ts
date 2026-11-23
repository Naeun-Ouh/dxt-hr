import { readFileSync } from 'node:fs';
import { contractsDatabase } from './contracts-fixture';
export const transferMigration='supabase/migrations/20261120122253_asset_transfers.sql';
export async function assetTransferDatabase(){
 const db=await contractsDatabase();
 await db.exec(readFileSync(transferMigration,'utf8'));
 return db;
}
