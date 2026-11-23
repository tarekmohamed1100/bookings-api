const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { AppError } = require("./errors");
const schemas = require("./validation");
const { requireAuth, requireAdmin } = require("./middleware/auth");

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function createApp({ store, config, logRequests = true }) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  if (logRequests) {
    app.use((req, res, next) => {
      const start = Date.now();
      res.on("finish", () => {
        console.log(JSON.stringify({ level: "info", method: req.method, path: req.originalUrl, status: res.statusCode, ms: Date.now() - start }));
      });
      next();
    });
  }

  const auth = requireAuth(config);
  const admin = requireAdmin;

  const sign = (user) =>
    jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { algorithm: "HS256", expiresIn: config.tokenTtl });
  const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

  function parse(schema, body) {
    const result = schema.safeParse(body ?? {});
    if (!result.success) {
      throw new AppError(
        400,
        "Validation failed",
        result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
      );
    }
    return result.data;
  }

  app.get("/api/health", (req, res) => res.json({ ok: true }));

  // ---- Auth ----
  app.post("/api/auth/register", wrap(async (req, res) => {
    const data = parse(schemas.register, req.body);
    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await store.users.create({ name: data.name, email: data.email, passwordHash, role: "user" });
    if (!user) throw new AppError(409, "Email is already registered");
    res.status(201).json({ user: publicUser(user), token: sign(user) });
  }));

  app.post("/api/auth/login", wrap(async (req, res) => {
    const { email, password } = parse(schemas.login, req.body);
    const user = await store.users.findByEmail(email);
    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) throw new AppError(401, "Invalid email or password");
    res.json({ user: publicUser(user), token: sign(user) });
  }));

  // ---- Rooms ----
  app.get("/api/rooms", wrap(async (req, res) => {
    res.json({ rooms: await store.rooms.list() });
  }));

  app.post("/api/rooms", auth, admin, wrap(async (req, res) => {
    const room = await store.rooms.create(parse(schemas.room, req.body));
    res.status(201).json({ room });
  }));

  // ---- Bookings ----
  app.post("/api/bookings", auth, wrap(async (req, res) => {
    const data = parse(schemas.booking, req.body);
    const room = await store.rooms.findById(data.roomId);
    if (!room) throw new AppError(404, "Room not found");

    const result = await store.bookings.create({
      userId: req.user.id,
      roomId: data.roomId,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
    });
    if (result.conflict) throw new AppError(409, "Room is already booked for that time");
    res.status(201).json({ booking: result.booking });
  }));

  app.get("/api/bookings", auth, wrap(async (req, res) => {
    const bookings =
      req.user.role === "admin" ? await store.bookings.listAll() : await store.bookings.listFor(req.user.id);
    res.json({ bookings });
  }));

  app.delete("/api/bookings/:id", auth, wrap(async (req, res) => {
    const booking = await store.bookings.findById(req.params.id);
    // Respond 404 for other people's bookings too, so ids can't be probed.
    if (!booking || (booking.userId !== req.user.id && req.user.role !== "admin")) {
      throw new AppError(404, "Booking not found");
    }
    await store.bookings.remove(booking.id);
    res.status(204).end();
  }));

  // ---- Errors ----
  app.use((req, res) => res.status(404).json({ error: "Not found" }));

  app.use((err, req, res, next) => {
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
    }
    if (err.type === "entity.parse.failed") {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
    console.error(JSON.stringify({ level: "error", message: err.message, stack: err.stack }));
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}

module.exports = { createApp };
