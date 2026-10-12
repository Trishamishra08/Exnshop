/**
 * APIclub (https://apiclub.readme.io) KYC client: PAN OCR, cheque OCR,
 * bank account verification (pennyless) and face match.
 *
 * Env:
 *   APICLUB_API_KEY      required
 *   APICLUB_BASE_URL     default https://uat.apiclub.in/api (UAT returns DUMMY data;
 *                        production is https://prod.apiclub.in/api)
 */

export interface ApiclubResult<T> {
  ok: boolean;
  data?: T;
  message?: string;
  /** True when the call itself failed (network, timeout, not configured) rather than APIclub rejecting the data. */
  transient?: boolean;
}

const DEFAULT_BASE_URL = "https://uat.apiclub.in/api";
const TIMEOUT_MS = 45_000;

export const apiclubBaseUrl = () => (process.env.APICLUB_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
export const apiclubConfigured = () => Boolean(process.env.APICLUB_API_KEY);
/** UAT answers every request with dummy data, so its results must never count as verification. */
export const apiclubIsTestEnvironment = () => /\/\/uat\./i.test(apiclubBaseUrl());

async function call<T>(path: string, init: { json?: any; form?: FormData }): Promise<ApiclubResult<T>> {
  if (!apiclubConfigured()) {
    return { ok: false, transient: true, message: "APIclub is not configured (APICLUB_API_KEY missing)" };
  }

  const headers: Record<string, string> = { "x-api-key": process.env.APICLUB_API_KEY as string, accept: "application/json" };
  if (init.json) headers["Content-Type"] = "application/json";

  try {
    const res = await fetch(`${apiclubBaseUrl()}${path}`, {
      method: "POST",
      headers,
      body: init.json ? JSON.stringify(init.json) : init.form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      return { ok: false, transient: true, message: `APIclub returned an unreadable response (HTTP ${res.status})` };
    }
    if (!res.ok || body?.code !== 200 || body?.status !== "success") {
      const serverError = res.status >= 500;
      return {
        ok: false,
        transient: serverError,
        message: body?.message || body?.error || `APIclub error (HTTP ${res.status})`,
      };
    }
    return { ok: true, data: body.response as T };
  } catch (err: any) {
    const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
    return { ok: false, transient: true, message: timedOut ? "APIclub timed out" : `APIclub request failed: ${err?.message}` };
  }
}

const fileForm = (fields: Record<string, { buffer: Buffer; filename: string; mime: string }>) => {
  const form = new FormData();
  for (const [name, f] of Object.entries(fields)) {
    form.append(name, new Blob([new Uint8Array(f.buffer)], { type: f.mime }), f.filename);
  }
  return form;
};

export interface PanOcr {
  pan_no?: string;
  registered_name?: string;
  dob?: string;
  father_name?: string;
}
export const ocrPan = (image: { buffer: Buffer; mime: string }) =>
  call<PanOcr>("/v1/pan_ocr", { form: fileForm({ pan_image: { ...image, filename: "pan" } }) });

export interface ChequeOcr {
  beneficiary_name?: string;
  beneficiary_account?: string;
  beneficiary_ifsc?: string;
  account_type?: string;
  bank_name?: string;
  branch_name?: string;
}
export const ocrCheque = (image: { buffer: Buffer; mime: string }) =>
  call<ChequeOcr>("/v1/cheque_ocr", { form: fileForm({ cheque_image: { ...image, filename: "cheque" } }) });

export interface BankValidation {
  orderId?: string;
  account_details?: {
    beneficiary_name?: string;
    beneficiary_account?: string;
    beneficiary_ifsc?: string;
    bank_name?: string;
    branch_name?: string;
    account_status?: string;
  };
}
export const verifyBankPennyless = (input: { name: string; accno: string; ifsc: string }) =>
  call<BankValidation>("/v1/validate_pennyless", { json: input });

export interface FaceMatch {
  match_score?: string;
}
export const faceMatch = (docImage: { buffer: Buffer; mime: string }, selfie: { buffer: Buffer; mime: string }) =>
  call<FaceMatch>("/v1/face_match", {
    form: fileForm({
      doc_img: { ...docImage, filename: "doc" },
      selfie: { ...selfie, filename: "selfie" },
    }),
  });

// ── Comparison helpers ─────────────────────────────────────

const normName = (s?: string) =>
  (s || "")
    .toUpperCase()
    .replace(/[^A-Z ]/g, " ")
    .replace(/\b(MR|MRS|MS|SHRI|SMT|M\/S|MESSRS)\b/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/** 0..1 — share of name words found in the other name (order-insensitive, handles initials). */
export const nameSimilarity = (a?: string, b?: string): number => {
  const A = normName(a);
  const B = normName(b);
  if (!A.length || !B.length) return 0;
  const matches = (x: string, y: string) => x === y || (x.length === 1 && y.startsWith(x)) || (y.length === 1 && x.startsWith(y));
  const hit = (from: string[], into: string[]) => from.filter((w) => into.some((o) => matches(w, o))).length / from.length;
  return Math.min(hit(A, B), hit(B, A));
};
