import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';

// Rate limiting only runs in production. In development the hardcoded test OTP
// ("888888") and repeated manual testing would otherwise trip these limits
// constantly, so we no-op locally and only enforce it where it actually matters.
const isProduction = process.env.NODE_ENV === 'production';

const noop = (req: Request, _res: Response, next: NextFunction) => {
  if (req.method === 'OPTIONS') return next();
  next();
};

/**
 * Rate limiter for OTP requests — 5 requests per 15 minutes per mobile number
 * (falls back to IP if no mobile is present on the request body).
 */
export const otpRateLimiter = isProduction
  ? rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5,
      message: 'Too many OTP requests. Please try again after 15 minutes.',
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => {
        if (req.body?.mobile) {
          return req.body.mobile;
        }
        return ipKeyGenerator(req.ip || 'unknown');
      },
    })
  : noop;

/**
 * Rate limiter for login attempts — 10 attempts per 15 minutes per IP.
 */
export const loginRateLimiter = isProduction
  ? rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 10,
      message: 'Too many login attempts. Please try again after 15 minutes.',
      standardHeaders: true,
      legacyHeaders: false,
    })
  : noop;
