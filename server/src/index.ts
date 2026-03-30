import dotenv from "dotenv";
import path from "path";
import fs from "fs";
dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

import express from "express";
import cors from "cors";
import { ensureTmpDir } from "./utils.js";
import jobsRouter from "./routes/jobs.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: true }));
app.use(express.json());

ensureTmpDir();

const uploadsDir = path.resolve(process.cwd(), "..", "tmp", "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use("/api/jobs", jobsRouter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now() });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`API key configured: ${process.env.OPENROUTER_API_KEY ? "yes" : "NO — set OPENROUTER_API_KEY in .env"}`);
});
