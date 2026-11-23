const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { createApp } = require("../src/app");
const { createMemoryStore } = require("../src/store/memory");

const config = { jwtSecret: "test-secret", tokenTtl: "1h" };
let server, base, store, adminToken, userToken, otherToken, roomId;

async function call(method, path, { token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

before(async () => {
  store = createMemoryStore();
  server = createApp({ store, config, logRequests: false }).listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;

  const admin = await store.users.create({ name: "Admin", email: "admin@test.dev", passwordHash: "x", role: "admin" });
  adminToken = jwt.sign({ sub: admin.id, role: "admin" }, config.jwtSecret);

  const reg = await call("POST", "/api/auth/register", { body: { name: "Sara", email: "sara@test.dev", password: "password123" } });
  userToken = reg.body.token;

  const reg2 = await call("POST", "/api/auth/register", { body: { name: "Omar", email: "omar@test.dev", password: "password123" } });
  otherToken = reg2.body.token;

  const room = await call("POST", "/api/rooms", { token: adminToken, body: { name: "Room A", capacity: 6 } });
  roomId = room.body.room.id;
});

after(() => server.close());

test("register returns a token and never exposes the password hash", async () => {
  const res = await call("POST", "/api/auth/register", { body: { name: "New User", email: "new@test.dev", password: "password123" } });
  assert.equal(res.status, 201);
  assert.ok(res.body.token);
  assert.equal(res.body.user.passwordHash, undefined);
});

test("duplicate email is rejected with 409", async () => {
  const res = await call("POST", "/api/auth/register", { body: { name: "Dup", email: "sara@test.dev", password: "password123" } });
  assert.equal(res.status, 409);
});

test("login with wrong password gives a generic 401", async () => {
  const res = await call("POST", "/api/auth/login", { body: { email: "sara@test.dev", password: "wrong-password" } });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, "Invalid email or password");
});

test("bookings require a token", async () => {
  const res = await call("POST", "/api/bookings", { body: { roomId, startsAt: "2030-01-01T10:00:00Z", endsAt: "2030-01-01T11:00:00Z" } });
  assert.equal(res.status, 401);
});

test("only admins can create rooms", async () => {
  const res = await call("POST", "/api/rooms", { token: userToken, body: { name: "Nope", capacity: 2 } });
  assert.equal(res.status, 403);
});

test("rejects bookings where end is before start", async () => {
  const res = await call("POST", "/api/bookings", { token: userToken, body: { roomId, startsAt: "2030-01-01T12:00:00Z", endsAt: "2030-01-01T11:00:00Z" } });
  assert.equal(res.status, 400);
});

test("overlapping bookings for the same room conflict, adjacent ones do not", async () => {
  const first = await call("POST", "/api/bookings", { token: userToken, body: { roomId, startsAt: "2030-02-01T10:00:00Z", endsAt: "2030-02-01T12:00:00Z" } });
  assert.equal(first.status, 201);

  const overlap = await call("POST", "/api/bookings", { token: otherToken, body: { roomId, startsAt: "2030-02-01T11:00:00Z", endsAt: "2030-02-01T13:00:00Z" } });
  assert.equal(overlap.status, 409);

  const adjacent = await call("POST", "/api/bookings", { token: otherToken, body: { roomId, startsAt: "2030-02-01T12:00:00Z", endsAt: "2030-02-01T13:00:00Z" } });
  assert.equal(adjacent.status, 201);
});

test("users only see their own bookings, admins see all", async () => {
  const mine = await call("GET", "/api/bookings", { token: userToken });
  assert.ok(mine.body.bookings.every((b) => b.userId !== undefined));
  const userIds = new Set(mine.body.bookings.map((b) => b.userId));
  assert.equal(userIds.size, 1);

  const all = await call("GET", "/api/bookings", { token: adminToken });
  assert.ok(all.body.bookings.length >= mine.body.bookings.length);
});

test("deleting someone else's booking returns 404, owner can delete", async () => {
  const created = await call("POST", "/api/bookings", { token: userToken, body: { roomId, startsAt: "2030-03-01T09:00:00Z", endsAt: "2030-03-01T10:00:00Z" } });
  const id = created.body.booking.id;

  const notOwner = await call("DELETE", `/api/bookings/${id}`, { token: otherToken });
  assert.equal(notOwner.status, 404);

  const owner = await call("DELETE", `/api/bookings/${id}`, { token: userToken });
  assert.equal(owner.status, 204);
});

test("invalid JSON and unknown routes return clean JSON errors", async () => {
  const bad = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{oops" });
  assert.equal(bad.status, 400);

  const missing = await call("GET", "/api/nope");
  assert.equal(missing.status, 404);
});
