import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { apiSearch } from "../../services/api.js";

export const searchDishes = createAsyncThunk("search/run", async ({ query }) => {
  const data = await apiSearch(query);
  return data.results || [];
});

const slice = createSlice({
  name: "search",
  initialState: { query: "", results: [], status: "" },
  reducers: {
    setQuery(state, action) { state.query = action.payload || ""; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(searchDishes.pending, (state) => { state.status = "Searching..."; })
      .addCase(searchDishes.fulfilled, (state, action) => { state.results = action.payload; state.status = action.payload.length ? `Found ${action.payload.length} restaurant(s)` : "No results"; })
      .addCase(searchDishes.rejected, (state) => { state.status = "Search failed"; });
  },
});

export const { setQuery } = slice.actions;
export default slice.reducer;
