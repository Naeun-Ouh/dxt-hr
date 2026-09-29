import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
test("membership schema rejects escalation and enforces own-row RLS and one designated admin", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select current_setting('request.jwt.claim.sub', true)::uuid $$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
    await db.exec(readFileSync("supabase/migrations/202609300001_foundation.sql", "utf8"));
    const ids = Array.from({ length: 5 }, (_, i) => `00000000-0000-4000-8000-00000000000${i}`);
    for (const id of ids) await db.query("insert into auth.users values ($1)", [id]);
    const insert = (index: number, roles: string[], grants: string[]) => db.query("insert into public.app_memberships (user_id,display_name,roles,capabilities) values ($1,'Test',$2,$3)", [ids[index], roles, grants]);
    await insert(0, ["ADMIN"], ["PRIVATE_HR_ACCESS"]);
    await assert.rejects(insert(1, ["ADMIN"], ["PRIVATE_HR_ACCESS"]));
    await insert(1, ["CEO"], ["PRIVATE_HR_ACCESS"]);
    await assert.rejects(insert(2, ["IT_ADMIN"], ["PRIVATE_HR_ACCESS"]));
    await assert.rejects(insert(2, ["EMPLOYEE"], ["WINDOWS_KEY_REVEAL"]));
    await assert.rejects(insert(2, ["UNKNOWN"], []));
    await assert.rejects(insert(2, [], []));
    await insert(2, ["EMPLOYEE"], []);
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${ids[2]}';`);
    const result = await db.query<{ user_id: string }>("select user_id from public.app_memberships");
    assert.deepEqual(result.rows, [{ user_id: ids[2] }]);
    await assert.rejects(db.exec("update public.app_memberships set roles = array['CEO']"));
    await assert.rejects(db.exec("delete from public.app_memberships"));
    await assert.rejects(insert(3, ["CEO"], []));
    await db.exec("reset role; set role anon;");
    await assert.rejects(db.exec("select * from public.app_memberships"));
  } finally { await db.close(); }
});
