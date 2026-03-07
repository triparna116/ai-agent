import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { apiGetMenu, apiUploadImage, apiUpdateMenuItem } from "../../services/api.js";

export const fetchMenu = createAsyncThunk("menu/fetch", async ({ id }) => {
  const data = await apiGetMenu(id);
  return { items: data.items || [], images: (data.restaurant && data.restaurant.images) || [] };
});

export const uploadImage = createAsyncThunk("menu/upload", async ({ token, id, file }) => {
  const { ok, data } = await apiUploadImage(token, id, file);
  if (!ok) throw new Error(data.error || "Failed");
  return data;
});

export const updateMenuItem = createAsyncThunk("menu/updateItem", async ({ token, id, menuId, updates }) => {
  const { ok, data } = await apiUpdateMenuItem(token, id, menuId, updates);
  if (!ok) throw new Error(data.error || "Failed");
  return data.item;
});

const slice = createSlice({
  name: "menu",
  initialState: { items: [], images: [], lastPreview: [], status: "" },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchMenu.fulfilled, (state, action) => { state.items = action.payload.items; state.images = action.payload.images; })
      .addCase(uploadImage.fulfilled, (state, action) => { state.status = `Image saved, added ${action.payload.added} items`; state.lastPreview = action.payload.itemsPreview || []; })
      .addCase(updateMenuItem.fulfilled, (state, action) => { state.items = state.items.map((m) => (m.id === action.payload.id ? action.payload : m)); });
  },
});

export default slice.reducer;
