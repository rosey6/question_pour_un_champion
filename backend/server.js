import cors from "cors";

const allowed = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : "*";

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowed === "*" || allowed.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  },
  credentials: true
}));
