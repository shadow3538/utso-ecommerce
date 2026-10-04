const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const productSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, default: "", maxlength: 2000 },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "BDT", trim: true, maxlength: 5 },
    imageUrl: { type: String, default: "", trim: true },
    stock: { type: Number, default: 0, min: 0, validate: Number.isInteger },
    category: { type: String, default: "General", trim: true, maxlength: 80 },
    brand: { type: String, default: "", trim: true, maxlength: 80 },
    sku: { type: String, default: "", trim: true, uppercase: true, maxlength: 50 },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

productSchema.index({ title: "text", description: "text", category: "text", brand: "text" });
productSchema.index({ createdAt: -1 });
productSchema.index({ category: 1 });

module.exports = model("Product", productSchema);
