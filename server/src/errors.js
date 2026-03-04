export class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status || 500;
    this.code = code || "internal_error";
  }
}

export class ApiResponse {
  static ok(res, data) {
    res.json(data);
  }
  static created(res, data) {
    res.status(201).json(data);
  }
}

export function errorMiddleware(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }
  res.status(500).json({ error: "internal_error", message: err?.message || "Unexpected error" });
}
