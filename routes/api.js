const router = require("express").Router();
const mongoose = require("mongoose");
const Product = require("../model/product");
const Order = require("../model/order");

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

router.get("/products", async (req, res) => {
  try {
    const page = positiveInt(req.query.page, 1);
    const limit = Math.min(50, positiveInt(req.query.limit, 12));
    const q = String(req.query.q || "").trim();
    const category = String(req.query.category || "").trim();
    const sort = String(req.query.sort || "newest");
    const filter = { isActive: true };

    if (q) filter.$or = [
      { title: { $regex: q, $options: "i" } },
      { description: { $regex: q, $options: "i" } },
      { category: { $regex: q, $options: "i" } },
      { brand: { $regex: q, $options: "i" } }
    ];
    if (category) filter.category = category;

    const sortMap = {
      newest: { createdAt: -1 },
      name: { title: 1 },
      priceLow: { price: 1 },
      priceHigh: { price: -1 },
      stockLow: { stock: 1 }
    };

    const [products, total, categories] = await Promise.all([
      Product.find(filter).sort(sortMap[sort] || sortMap.newest).skip((page - 1) * limit).limit(limit).lean(),
      Product.countDocuments(filter),
      Product.distinct("category", { isActive: true })
    ]);

    res.json({ products, page, limit, total, totalPages: Math.ceil(total / limit), categories: categories.sort() });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch products" });
  }
});

router.get("/products/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid product id" });
    const product = await Product.findOne({ _id: req.params.id, isActive: true }).lean();
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch {
    res.status(500).json({ message: "Failed to fetch product" });
  }
});

router.post("/orders", async (req, res) => {
  try {
    const { customerName, customerEmail, deliveryAddress, items } = req.body;
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(customerEmail || "").trim());
    if (!String(customerName || "").trim() || !emailOk || !String(deliveryAddress || "").trim() || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Please provide valid customer and order details" });
    }

    const grouped = new Map();
    for (const item of items) {
      if (!mongoose.isValidObjectId(item.productId)) return res.status(400).json({ message: "Invalid product in order" });
      const quantity = Number(item.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) return res.status(400).json({ message: "Invalid quantity" });
      grouped.set(String(item.productId), (grouped.get(String(item.productId)) || 0) + quantity);
    }

    const ids = [...grouped.keys()];
    const products = await Product.find({ _id: { $in: ids }, isActive: true });
    if (products.length !== ids.length) return res.status(400).json({ message: "One or more products are unavailable" });

    const productMap = new Map(products.map((product) => [String(product._id), product]));
    const orderItems = [];
    let totalAmount = 0;

    for (const id of ids) {
      const product = productMap.get(id);
      const quantity = grouped.get(id);
      if (product.stock < quantity) return res.status(400).json({ message: `Insufficient stock for ${product.title}` });
      orderItems.push({ productId: product._id, title: product.title, quantity, price: product.price });
      totalAmount += product.price * quantity;
    }

    for (const id of ids) {
      const quantity = grouped.get(id);
      const updated = await Product.findOneAndUpdate(
        { _id: id, isActive: true, stock: { $gte: quantity } },
        { $inc: { stock: -quantity } },
        { new: true }
      );
      if (!updated) {
        for (const rollbackId of ids) {
          const rollbackQty = grouped.get(rollbackId);
          if (rollbackId === id) break;
          await Product.findByIdAndUpdate(rollbackId, { $inc: { stock: rollbackQty } });
        }
        return res.status(409).json({ message: "Stock changed while placing the order. Please try again." });
      }
    }

    const order = await Order.create({
      customerName: String(customerName).trim(),
      customerEmail: String(customerEmail).trim().toLowerCase(),
      deliveryAddress: String(deliveryAddress).trim(),
      items: orderItems,
      totalAmount
    });

    const io = req.app.get("io");
    io.emit("productUpdate");
    io.emit("newOrder", { orderId: order._id, totalAmount: order.totalAmount, customerName: order.customerName });

    res.status(201).json({ message: "Order placed", order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to place order" });
  }
});

router.get("/orders/track", async (req, res) => {
  try {
    const id = String(req.query.id || "");
    const email = String(req.query.email || "").trim().toLowerCase();
    if (!mongoose.isValidObjectId(id) || !email) return res.status(400).json({ message: "Order ID and email are required" });
    const order = await Order.findOne({ _id: id, customerEmail: email }).lean();
    if (!order) return res.status(404).json({ message: "Order not found" });
    res.json(order);
  } catch {
    res.status(500).json({ message: "Failed to track order" });
  }
});

module.exports = router;
