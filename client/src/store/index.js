import { configureStore } from "@reduxjs/toolkit";
import auth from "./slices/authSlice.js";
import restaurants from "./slices/restaurantsSlice.js";
import menu from "./slices/menuSlice.js";
import search from "./slices/searchSlice.js";

export const store = configureStore({
  reducer: { auth, restaurants, menu, search },
});
