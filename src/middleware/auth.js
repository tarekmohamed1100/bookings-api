const jwt = require("jsonwebtoken");
const { AppError } = require("../errors");

function requireAuth(config) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return next(new AppError(401, "Missing bearer token"));

    try {
      const payload = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
      req.user = { id: payload.sub, role: payload.role };
      next();
    } catch (err) {
      next(new AppError(401, "Invalid or expired token"));
    }
  };
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return next(new AppError(403, "Admins only"));
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
