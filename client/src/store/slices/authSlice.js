import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { apiLogin, apiRegister } from "../../services/api.js";

export const login = createAsyncThunk("auth/login", async ({ username, password }) => {
  const { ok, data } = await apiLogin(username, password);
  if (!ok) throw new Error(data.error || "Login failed");
  return data.token;
});

export const register = createAsyncThunk("auth/register", async ({ username, password }) => {
  const { ok, data } = await apiRegister(username, password);
  if (!ok) throw new Error(data.error || "Registration failed");
  return data;
});

const initialToken = typeof sessionStorage !== "undefined" ? sessionStorage.getItem("jwt") || "" : "";

const slice = createSlice({
  name: "auth",
  initialState: { token: initialToken, status: "", error: "" },
  reducers: {
    logout(state) {
      state.token = "";
      if (typeof sessionStorage !== "undefined") sessionStorage.removeItem("jwt");
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => { state.status = "Signing in..."; state.error = ""; })
      .addCase(login.fulfilled, (state, action) => {
        state.token = action.payload;
        state.status = "Signed in";
        if (typeof sessionStorage !== "undefined") sessionStorage.setItem("jwt", action.payload);
      })
      .addCase(login.rejected, (state, action) => { state.error = action.error.message || "Login failed"; state.status = ""; })
      .addCase(register.pending, (state) => { state.status = "Registering..."; state.error = ""; })
      .addCase(register.fulfilled, (state) => { state.status = "Registered, now sign in"; })
      .addCase(register.rejected, (state, action) => { state.error = action.error.message || "Registration failed"; state.status = ""; });
  },
});

export const { logout } = slice.actions;
export default slice.reducer;
