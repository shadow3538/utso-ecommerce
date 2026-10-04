const router = require("express").Router();
const mongoose = require("mongoose");
const Product = require("../model/product");
const Order = require("../model/order");
const { adminAuth, createAdminToken } = require("../middleware/auth");

router.post("/login", (req, res) => {
  const username = String(req.body.username || "");
  const password = String(req.body.password || "");
  if (!username || !password || username !== process.env.ADMIN_USERNAME || password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ message: "Invalid username or password" });
  }
  res.json({ token: createAdminToken(username), username });
});

router.get("/me", adminAuth, (req, res) => res.json({ username: req.admin.username }));

router.get("/dashboard", adminAuth, async (req, res) => {
  try {
    const [products, orders, revenue, lowStock, activeProducts, pendingOrders, categories] = await Promise.all([
      Product.countDocuments(),
      Order.countDocuments(),
      Order.aggregate([{ $match: { status: { $ne: "CANCELLED" } } }, { $group: { _id: null, total: { $sum: "$totalAmount" } } }]),
      Product.countDocuments({ stock: { $lte: 5 }, isActive: true }),
      Product.countDocuments({ isActive: true }),
      Order.countDocuments({ status: { $in: ["PLACED", "CONFIRMED", "SHIPPED"] } }),
      Product.distinct("category")
    ]);
    res.json({ products, activeProducts, orders, revenue: revenue[0]?.total || 0, lowStock, pendingOrders, categories: categories.length });
  } catch {
    res.status(500).json({ message: "Failed to load dashboard" });
  }
});

router.get("/products", adminAuth, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 15));
    const q = String(req.query.q || "").trim();
    const sort = String(req.query.sort || "newest");
    const filter = q ? { $or: [
      { title: { $regex: q, $options: "i" } },
      { sku: { $regex: q, $options: "i" } },
      { category: { $regex: q, $options: "i" } },
      { brand: { $regex: q, $options: "i" } }
    ] } : {};
    const sortMap = { newest: { createdAt: -1 }, name: { title: 1 }, priceLow: { price: 1 }, priceHigh: { price: -1 }, stockLow: { stock: 1 } };
    const [products, total] = await Promise.all([
      Product.find(filter).sort(sortMap[sort] || sortMap.newest).skip((page - 1) * limit).limit(limit),
      Product.countDocuments(filter)
    ]);
    res.json({ products, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch {
    res.status(500).json({ message: "Failed to fetch products" });
  }
});

router.post("/products", adminAuth, async (req, res) => {
  try {
    const product = await Product.create(normalizeProduct(req.body));
    req.app.get("io").emit("productUpdate");
    res.status(201).json(product);
  } catch (err) {
    res.status(400).json({ message: err.message || "Failed to create product" });
  }
});

router.put("/products/:id", adminAuth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid product id" });
    const product = await Product.findByIdAndUpdate(req.params.id, normalizeProduct(req.body), { new: true, runValidators: true });
    if (!product) return res.status(404).json({ message: "Product not found" });
    req.app.get("io").emit("productUpdate");
    res.json(product);
  } catch (err) {
    res.status(400).json({ message: err.message || "Failed to update product" });
  }
});

router.delete("/products/:id", adminAuth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid product id" });
    const product = await Product.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!product) return res.status(404).json({ message: "Product not found" });
    req.app.get("io").emit("productUpdate");
    res.json({ message: "Product archived" });
  } catch {
    res.status(500).json({ message: "Failed to delete product" });
  }
});

router.get("/orders", adminAuth, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 15));
    const status = String(req.query.status || "").trim();
    const q = String(req.query.q || "").trim();
    const filter = {};
    if (status) filter.status = status;
    if (q) filter.$or = [
      { customerName: { $regex: q, $options: "i" } },
      { customerEmail: { $regex: q, $options: "i" } }
    ];
    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Order.countDocuments(filter)
    ]);
    res.json({ orders, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch {
    res.status(500).json({ message: "Failed to fetch orders" });
  }
});

router.patch("/orders/:id/status", adminAuth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid order id" });
    const allowed = ["PLACED", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED"];
    const status = String(req.body.status || "");
    if (!allowed.includes(status)) return res.status(400).json({ message: "Invalid status" });
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    if (order.status === "CANCELLED" && status !== "CANCELLED") return res.status(400).json({ message: "Cancelled orders cannot be reopened" });
    if (order.status === "DELIVERED" && status !== "DELIVERED") return res.status(400).json({ message: "Delivered orders cannot be changed" });
    if (status === "CANCELLED" && order.status !== "CANCELLED") {
      for (const item of order.items) await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.quantity } });
    }
    order.status = status;
    await order.save();
    req.app.get("io").emit("orderUpdate", { orderId: order._id, status: order.status });
    req.app.get("io").emit("productUpdate");
    res.json(order);
  } catch {
    res.status(500).json({ message: "Failed to update order" });
  }
});

function normalizeProduct(body) {
  return {
    title: String(body.title || "").trim(),
    description: String(body.description || "").trim(),
    price: Number(body.price),
    currency: String(body.currency || "BDT").trim().toUpperCase(),
    imageUrl: String(body.imageUrl || "").trim(),
    stock: Number(body.stock),
    category: String(body.category || "General").trim() || "General",
    brand: String(body.brand || "").trim(),
    sku: String(body.sku || "").trim().toUpperCase(),
    isActive: body.isActive !== false
  };
}

module.exports = router;
