const { z } = require("zod");

const register = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(8).max(128),
});

const login = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});

const room = z.object({
  name: z.string().trim().min(1).max(80),
  capacity: z.number().int().min(1).max(500),
});

const booking = z
  .object({
    roomId: z.string().uuid(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
  })
  .refine((b) => new Date(b.endsAt) > new Date(b.startsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });

module.exports = { register, login, room, booking };
