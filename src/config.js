const env = process.env.NODE_ENV || "development";
const jwtSecret = process.env.JWT_SECRET;

if (env === "production" && !jwtSecret) {
  throw new Error("JWT_SECRET is required in production");
}

module.exports = {
  env,
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || "",
  jwtSecret: jwtSecret || "dev-only-secret-change-me",
  tokenTtl: process.env.TOKEN_TTL || "1h",
};
