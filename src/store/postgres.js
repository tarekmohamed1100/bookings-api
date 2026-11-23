const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const toUser = (r) => r && { id: r.id, name: r.name, email: r.email, passwordHash: r.password_hash, role: r.role };
const toRoom = (r) => r && { id: r.id, name: r.name, capacity: r.capacity };
const toBooking = (r) => ({
  id: r.id,
  userId: r.user_id,
  roomId: r.room_id,
  startsAt: new Date(r.starts_at).toISOString(),
  endsAt: new Date(r.ends_at).toISOString(),
});

function createPgStore(databaseUrl) {
  const pool = new Pool({ connectionString: databaseUrl });
  const q = (text, params) => pool.query(text, params);

  return {
    async init() {
      await q(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));
    },
    async close() {
      await pool.end();
    },

    users: {
      async create({ name, email, passwordHash, role }) {
        try {
          const { rows } = await q(
            "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *",
            [name, email, passwordHash, role]
          );
          return toUser(rows[0]);
        } catch (err) {
          if (err.code === "23505") return null; // unique_violation on email
          throw err;
        }
      },
      async findByEmail(email) {
        const { rows } = await q("SELECT * FROM users WHERE email = $1", [email]);
        return toUser(rows[0]);
      },
      async findById(id) {
        const { rows } = await q("SELECT * FROM users WHERE id = $1", [id]);
        return toUser(rows[0]);
      },
    },

    rooms: {
      async list() {
        const { rows } = await q("SELECT * FROM rooms ORDER BY name");
        return rows.map(toRoom);
      },
      async create({ name, capacity }) {
        const { rows } = await q("INSERT INTO rooms (name, capacity) VALUES ($1, $2) RETURNING *", [name, capacity]);
        return toRoom(rows[0]);
      },
      async findById(id) {
        const { rows } = await q("SELECT * FROM rooms WHERE id = $1", [id]);
        return toRoom(rows[0]);
      },
    },

    bookings: {
      async create({ userId, roomId, startsAt, endsAt }) {
        try {
          const { rows } = await q(
            "INSERT INTO bookings (user_id, room_id, starts_at, ends_at) VALUES ($1, $2, $3, $4) RETURNING *",
            [userId, roomId, startsAt, endsAt]
          );
          return { booking: toBooking(rows[0]) };
        } catch (err) {
          if (err.code === "23P01") return { conflict: true }; // exclusion_violation
          throw err;
        }
      },
      async listFor(userId) {
        const { rows } = await q("SELECT * FROM bookings WHERE user_id = $1 ORDER BY starts_at", [userId]);
        return rows.map(toBooking);
      },
      async listAll() {
        const { rows } = await q("SELECT * FROM bookings ORDER BY starts_at");
        return rows.map(toBooking);
      },
      async findById(id) {
        const { rows } = await q("SELECT * FROM bookings WHERE id = $1", [id]);
        return rows[0] ? toBooking(rows[0]) : null;
      },
      async remove(id) {
        const { rowCount } = await q("DELETE FROM bookings WHERE id = $1", [id]);
        return rowCount > 0;
      },
    },
  };
}

module.exports = { createPgStore };
