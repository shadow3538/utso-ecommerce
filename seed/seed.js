require("dotenv").config();
const connectDB = require("../config/config");
const Product = require("../model/product");

const products = [
  { title: "Wireless Mouse", description: "Comfortable wireless mouse for everyday work.", price: 850, stock: 25, category: "Accessories", brand: "UTSHO", sku: "UT-MOUSE-01", imageUrl: "https://placehold.co/800x500?text=Wireless+Mouse" },
  { title: "Mechanical Keyboard", description: "Compact mechanical keyboard for work and gaming.", price: 3200, stock: 12, category: "Accessories", brand: "UTSHO", sku: "UT-KEY-01", imageUrl: "https://placehold.co/800x500?text=Keyboard" },
  { title: "USB-C Hub", description: "Multi-port USB-C hub for laptops and tablets.", price: 1800, stock: 18, category: "Accessories", brand: "UTSHO", sku: "UT-HUB-01", imageUrl: "https://placehold.co/800x500?text=USB-C+Hub" },
  { title: "128GB SSD", description: "Fast solid-state storage for desktop and laptop upgrades.", price: 2800, stock: 8, category: "Storage", brand: "UTSHO", sku: "UT-SSD-128", imageUrl: "https://placehold.co/800x500?text=128GB+SSD" }
];

(async () => {
  await connectDB();
  await Product.deleteMany({});
  await Product.insertMany(products);
  console.log("Seed completed");
  process.exit(0);
})();
