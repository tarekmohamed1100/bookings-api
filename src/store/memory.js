const crypto = require("crypto");

// Same interface as the Postgres store. Useful for tests and quick local runs.
function createMemoryStore() {
  const users = new Map();
  const rooms = new Map();
  const bookings = new Map();

  return {
    users: {
      async create({ name, email, passwordHash, role }) {
        for (const u of users.values()) if (u.email === email) return null;
        const user = { id: crypto.randomUUID(), name, email, passwordHash, role, createdAt: new Date().toISOString() };
        users.set(user.id, user);
        return user;
      },
      async findByEmail(email) {
        for (const u of users.values()) if (u.email === email) return u;
        return null;
      },
      async findById(id) {
        return users.get(id) || null;
      },
    },

    rooms: {
      async list() {
        return [...rooms.values()];
      },
      async create({ name, capacity }) {
        const room = { id: crypto.randomUUID(), name, capacity };
        rooms.set(room.id, room);
        return room;
      },
      async findById(id) {
        return rooms.get(id) || null;
      },
    },

    bookings: {
      async create({ userId, roomId, startsAt, endsAt }) {
        const start = new Date(startsAt);
        const end = new Date(endsAt);
        for (const b of bookings.values()) {
          if (b.roomId === roomId && new Date(b.startsAt) < end && start < new Date(b.endsAt)) {
            return { conflict: true };
          }
        }
        const booking = { id: crypto.randomUUID(), userId, roomId, startsAt, endsAt };
        bookings.set(booking.id, booking);
        return { booking };
      },
      async listFor(userId) {
        return [...bookings.values()].filter((b) => b.userId === userId);
      },
      async listAll() {
        return [...bookings.values()];
      },
      async findById(id) {
        return bookings.get(id) || null;
      },
      async remove(id) {
        return bookings.delete(id);
      },
    },
  };
}

module.exports = { createMemoryStore };
