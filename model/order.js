const mongoose = require("mongoose");
const { Schema, model } = mongoose;

const orderItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    title: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

const orderSchema = new Schema(
  {
    customerName: { type: String, required: true, trim: true, maxlength: 120 },
    customerEmail: { type: String, required: true, trim: true, lowercase: true, maxlength: 160 },
    deliveryAddress: { type: String, required: true, trim: true, maxlength: 500 },
    items: { type: [orderItemSchema], required: true },
    totalAmount: { type: Number, required: true, min: 0 },
    paymentMethod: { type: String, enum: ["COD"], default: "COD" },
    status: {
      type: String,
      default: "PLACED",
      enum: ["PLACED", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED"]
    }
  },
  { timestamps: true }
);

orderSchema.index({ createdAt: -1 });
orderSchema.index({ customerEmail: 1, createdAt: -1 });
orderSchema.index({ status: 1 });

module.exports = model("Order", orderSchema);
