import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { apiAddRestaurant, apiListRestaurants } from "../../services/api.js";

export const fetchRestaurants = createAsyncThunk("restaurants/list", async () => {
  const data = await apiListRestaurants();
  return data.restaurants || [];
});

export const createRestaurant = createAsyncThunk("restaurants/create", async ({ token, name }) => {
  const { ok, data } = await apiAddRestaurant(token, name);
  if (!ok) throw new Error(data.error || "Failed");
  return data;
});

const slice = createSlice({
  name: "restaurants",
  initialState: { items: [], selectedId: "" },
  reducers: {
    setSelectedId(state, action) { state.selectedId = action.payload || ""; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRestaurants.fulfilled, (state, action) => { state.items = action.payload; if (!state.selectedId && action.payload.length) state.selectedId = String(action.payload[0].id); })
      .addCase(createRestaurant.fulfilled, (state, action) => { state.items.push(action.payload); state.selectedId = String(action.payload.id); });
  },
});

export const { setSelectedId } = slice.actions;
export default slice.reducer;
