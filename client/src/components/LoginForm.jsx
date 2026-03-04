import { useDispatch, useSelector } from "react-redux";
import { login, register } from "../store/slices/authSlice.js";
import { useState } from "react";

export default function LoginForm() {
  const dispatch = useDispatch();
  const status = useSelector((s) => s.auth.status);
  const error = useSelector((s) => s.auth.error);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  return (
    <div className="panel">
      <h2>Admin Login</h2>
      <form onSubmit={(e) => { e.preventDefault(); dispatch(login({ username, password })); }}>
        <label>Username<input type="text" value={username} onChange={(e) => setUsername(e.target.value)} /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button type="submit">Login</button>
        <button type="button" onClick={(e) => { e.preventDefault(); dispatch(register({ username, password })); }} style={{ marginLeft: 8 }}>Register</button>
      </form>
      {status && <div className="status">{status}</div>}
      {error && <div className="status">{error}</div>}
    </div>
  );
}
