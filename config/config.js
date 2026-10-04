const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.DB_NAME;

  if (!uri) throw new Error("MONGO_URI is missing in .env");
  if (!dbName) throw new Error("DB_NAME is missing in .env");

  await mongoose.connect(uri, { dbName });
  console.log(`MongoDB connected to database: ${dbName}`);
}

module.exports = connectDB;
