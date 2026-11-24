import {readFileSync} from 'node:fs';
import {assetTransferDatabase} from './asset-transfer-fixture';
export async function monthlyExpenseDatabase(){
 const db=await assetTransferDatabase();
 for(const name of ['20261120124228_expense_grid_workspace.sql','20261120135814_restore_expense_payment_edit_window.sql','20261123141334_expense_monthly_attachments.sql','20261124125833_expense_payment_cards.sql'])await db.exec(readFileSync('supabase/migrations/'+name,'utf8'));
 return db;
}
