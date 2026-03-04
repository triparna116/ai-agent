import express from "express";
import { register, login } from "./controllers/authController.js";
import { addRestaurant, getRestaurants, getMenu, updateMenu } from "./controllers/restaurantController.js";
import { uploader, uploadAndOcr } from "./controllers/uploadController.js";
import { search } from "./controllers/searchController.js";
import { auth } from "./middleware/auth.js";

export const router = express.Router();

router.get("/health", (req, res) => res.json({ ok: true }));

router.post("/auth/register", register);
router.post("/auth/login", login);

router.post("/restaurants", auth, addRestaurant);
router.get("/restaurants", getRestaurants);
router.get("/restaurants/:id/menu", getMenu);
router.put("/restaurants/:id/menu/:menuId", auth, updateMenu);

router.post("/restaurants/:id/upload", auth, uploader.single("image"), uploadAndOcr);

router.get("/search", search);
