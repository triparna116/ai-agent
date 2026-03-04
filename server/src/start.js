import { app } from "./app.js";

const PORT = process.env.PORT || 4002;
app.listen(PORT, () => {
  console.log(`server on http://localhost:${PORT}`);
});
