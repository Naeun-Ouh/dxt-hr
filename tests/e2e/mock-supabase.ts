// Test-only external Auth/PostgREST double. There is no auth bypass in application code.
import { createServer } from "node:http";
import { cases, tokenFor } from "./fixtures";
const server = createServer(async (request, response) => {
  const url = new URL(request.url!, "http://localhost:54329");
  const name = Object.keys(cases).find(key => request.headers.authorization === `Bearer ${tokenFor(key)}`);
  response.setHeader("Content-Type", "application/json");
  if (url.pathname === "/health") return response.end('{}');
  if (url.pathname === "/auth/v1/authorize") {
    const callback = new URL(url.searchParams.get("redirect_to")!);
    if (callback.origin !== "http://localhost:3100" || !url.searchParams.get("code_challenge")) { response.writeHead(400); return response.end('{}'); }
    callback.searchParams.set("code", "fixture-code");
    response.writeHead(302, { Location: callback.toString() }); return response.end();
  }
  if (url.pathname === "/auth/v1/token" && request.method === "POST") {
    let body = "";
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body);
    if (input.auth_code !== "fixture-code" || !input.code_verifier) { response.writeHead(400); return response.end(JSON.stringify({ error: "invalid_grant" })); }
    return response.end(JSON.stringify({ access_token: tokenFor("employee"), refresh_token: "refresh-employee", token_type: "bearer", expires_in: 3600,
      user: { id: "employee", aud: "authenticated", email: "employee@example.test", app_metadata: {}, user_metadata: {} } }));
  }
  if (!name) { response.writeHead(401); return response.end(JSON.stringify({ message: "Invalid token" })); }
  if (url.pathname === "/auth/v1/user") return response.end(JSON.stringify({ id: name, aud: "authenticated", email: `${name}@example.test`, app_metadata: {}, user_metadata: { roles: ["CEO"] } }));
  if (url.pathname === "/rest/v1/app_memberships") {
    if (url.searchParams.get("user_id") !== `eq.${name}`) { response.writeHead(403); return response.end('{}'); }
    const fixture = cases[name];
    return response.end(JSON.stringify(name === "unprovisioned" ? [] : [{ display_name: "테스트 사용자", status: fixture.status || "ACTIVE", roles: fixture.roles, capabilities: fixture.capabilities || [] }]));
  }
  if (url.pathname === "/auth/v1/logout") { response.writeHead(204); return response.end(); }
  response.writeHead(404); response.end('{}');
});
server.listen(54329, "localhost");
