const { app } = require("../app.js");
const mongoose = require("mongoose");

let isConnecting = null;

async function ensureDbConnected() {
  if (mongoose.connection.readyState === 1) {
    return;
  }
  if (!isConnecting) {
    const dbUrl = process.env.ATLASDB_URL || process.env.DB_URL;
    if (dbUrl) {
      isConnecting = mongoose
        .connect(dbUrl)
        .then(() => {
          isConnecting = null;
        })
        .catch((err) => {
          isConnecting = null;
          console.error("MongoDB Atlas connection error on Vercel:", err);
        });
    }
  }
  await isConnecting;
}

module.exports = async (req, res) => {
  try {
    await ensureDbConnected();
  } catch (err) {
    console.error("Database connection initialization failed:", err);
  }
  return app(req, res);
};
