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
const allowOrigin = (origin) => {
  if (!origin) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
};
app.use(cors({ origin: (origin, cb) => cb(null, allowOrigin(origin)), credentials: true }));
app.use(express.json());
const clientDist = path.join(__dirname, "../../client/dist");
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
