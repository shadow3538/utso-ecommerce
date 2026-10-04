const crypto = require("crypto");

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", process.env.ADMIN_SECRET).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyToken(token) {
  if (!token || !process.env.ADMIN_SECRET) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  const expected = crypto.createHmac("sha256", process.env.ADMIN_SECRET).update(body).digest("base64url");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return payload.exp && payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

function adminAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const payload = verifyToken(token);
  if (!payload || payload.role !== "admin") return res.status(401).json({ message: "Unauthorized" });
  req.admin = payload;
  next();
}

function createAdminToken(username) {
  return signToken({ role: "admin", username, exp: Date.now() + 8 * 60 * 60 * 1000 });
}

module.exports = { adminAuth, createAdminToken };
