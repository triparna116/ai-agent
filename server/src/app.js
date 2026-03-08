import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { router } from "./routes.js";
import swaggerUi from "swagger-ui-express";
import fs from "fs";
import { errorMiddleware } from "./errors.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();
const allowedOrigins = [process.env.FRONTEND_URL, "http://localhost:5173", "http://localhost:5174"].filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin)) {
      cb(null, true);
    } else {
      cb(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));
app.use(express.json());
const clientDist = path.resolve(__dirname, "..", "dist");
console.log(`[SERVER] Static files path: ${clientDist}`);
console.log(`[SERVER] Index exists: ${fs.existsSync(path.join(clientDist, "index.html"))}`);

app.use(express.static(clientDist));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/api", router);

const specPath = path.join(__dirname, "swagger.json");
let spec = {};
if (fs.existsSync(specPath)) {
  const raw = fs.readFileSync(specPath, "utf-8");
  spec = JSON.parse(raw);
}
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(spec));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(clientDist, "index.html"));
});

app.use(errorMiddleware);
