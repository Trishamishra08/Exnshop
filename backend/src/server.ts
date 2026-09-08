import express, { Application, Request, Response } from "express";
import { createServer } from "http";
import cors from "cors";
import compression from "compression";
import dotenv from "dotenv";
import connectDB from "./config/db";
import routes from "./routes";
import { errorHandler } from "./middleware/errorHandler";
import { notFound } from "./middleware/notFound";
import { ensureDefaultAdmin } from "./utils/ensureDefaultAdmin";
import { seedHeaderCategories } from "./utils/seedHeaderCategories";
import { initializeSocket } from "./socket/socketService";
import { initializeFirebaseAdmin } from "./services/firebaseAdmin";


// Load environment variables
dotenv.config();

// Server Instance
const app: Application = express();
const httpServer = createServer(app);

// Environment-driven CORS configuration
const envOrigins = [
  ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(",").map(url => url.trim()) : []),
  ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(",").map(url => url.trim()) : [])
];
const allowedOrigins = envOrigins.filter(url => url.length > 0);

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // In development, allow localhost
    if (process.env.NODE_ENV !== "production") {
      if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) {
        return callback(null, true);
      }
    }

    // Normalize origin (remove trailing slash)
    const normalizedOrigin = origin.replace(/\/$/, '');

    // Check if origin is in allowed list (exact / www / non-www)
    const isAllowed = allowedOrigins.some(allowed => {
      const normalizedAllowed = allowed.replace(/\/$/, '');
      if (
        origin === allowed ||
        normalizedOrigin === normalizedAllowed ||
        origin === normalizedAllowed ||
        normalizedOrigin === allowed
      ) {
        return true;
      }
      // Allow www and non-www variants of the same domain
      if (normalizedAllowed.includes('www.')) {
        const nonWww = normalizedAllowed.replace('www.', '');
        if (normalizedOrigin === nonWww) return true;
      } else {
        const withWww = normalizedAllowed.replace(/^(https?:\/\/)/, '$1www.');
        if (normalizedOrigin === withWww) return true;
      }
      return false;
    });

    if (isAllowed) {
      return callback(null, true);
    }

    // Reject if not allowed - return false instead of error for better handling
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin"],
  exposedHeaders: ["Content-Length", "Content-Type"],
  maxAge: 86400,
};

// Apply compression middleware - Reduces payload size effectively
app.use(compression());

// Apply CORS middleware - This handles everything including preflight
app.use(cors(corsOptions));

import path from "path";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve local uploaded files statically
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// Initialize Socket.io
const io = initializeSocket(httpServer);
app.set("io", io);

// Routes
app.get("/", (_req: Request, res: Response) => {
  const appName = process.env.APP_NAME || "Exnshop";
  res.json({
    message: `${appName} API Server is running!`,
    version: "1.0.0",
    socketIO: "Listening for WebSocket connections",
  });
});

// Request logger for home page debugging (Development mode only)
if (process.env.NODE_ENV !== "production") {
  app.use((req, _res, next) => {
    if (req.path.includes('/customer/home')) {
      console.log(`[REQUEST] ${req.method} ${req.originalUrl} - query:`, req.query);
    }
    next();
  });
}

// API Routes
app.use("/api/v1", routes);

// Error handling middleware (must be last)
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";

async function startServer() {
  // Listen FIRST so Hostinger proxy gets a live process (avoids 503 while DB connects)
  httpServer.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(`\n\x1b[31m✗ Port ${PORT} is already in use!\x1b[0m`);
      process.exit(1);
    }
    console.error("\n\x1b[31m✗ Server error:\x1b[0m", error);
    process.exit(1);
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(Number(PORT), HOST, () => {
      console.log("\n\x1b[32m✓\x1b[0m \x1b[1mExnshop Server Listening\x1b[0m");
      console.log(`   \x1b[36mAddress:\x1b[0m http://${HOST}:${PORT}`);
      console.log(
        `   \x1b[36mEnvironment:\x1b[0m ${process.env.NODE_ENV || "development"}`
      );
      resolve();
    });
  });

  try {
    await connectDB();
    await ensureDefaultAdmin();
    await seedHeaderCategories();
    initializeFirebaseAdmin();
    console.log(`   \x1b[36mSocket.IO:\x1b[0m ✓ Ready`);
    console.log(`   [DEBUG] Fully started at: ${new Date().toISOString()}\n`);
  } catch (err) {
    console.error("\n\x1b[31m✗ Startup init failed (API is up but DB/features may be down)\x1b[0m");
    console.error(err);
    console.error(
      "\x1b[33m  → Check Hostinger env vars (MONGODB_URI) and MongoDB Atlas Network Access (allow 0.0.0.0/0)\x1b[0m\n"
    );
  }
}

startServer().catch((err) => {
  console.error("\n\x1b[31m✗ Failed to start server\x1b[0m");
  console.error(err);
  process.exit(1);
});

