import { ISeller, IVerificationCheck, VerificationCheckType, VERIFICATION_CHECK_TYPES } from "../models/Seller";
import {
  apiclubConfigured,
  apiclubIsTestEnvironment,
  faceMatch,
  nameSimilarity,
  ocrCheque,
  ocrPan,
  verifyBankPennyless,
} from "./apiclubService";
import { auditSeller, maskAccountNumber, signedDocumentUrl } from "./sellerOnboardingService";

type CheckOutcome = Omit<IVerificationCheck, "type" | "ranAt" | "ranBy">;

const NAME_MATCH_MIN = 0.6;
const faceThreshold = () => Number(process.env.APICLUB_FACE_MATCH_THRESHOLD) || 80;

const TEST_MODE_NOTE =
  "APIclub is in test (UAT) mode and returns dummy data, so this can't verify anything. Set APICLUB_BASE_URL to the production URL for real results.";

const pct = (n: number) => `${Math.round(n * 100)}%`;
const digits = (s?: string) => (s || "").replace(/\D/g, "");

const IMAGE_FORMATS = new Set(["jpg", "jpeg", "png", "webp"]);
const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Downloads a stored (private) document so it can be sent to APIclub. */
const loadImage = async (seller: ISeller, docType: string): Promise<{ buffer: Buffer; mime: string } | { problem: string }> => {
  const doc = seller.documents.find((d) => d.docType === docType);
  if (!doc) return { problem: `The seller hasn't uploaded the ${docType.replace(/_/g, " ").toLowerCase()} yet` };
  const format = (doc.format || "").toLowerCase();
  if (!IMAGE_FORMATS.has(format)) return { problem: "This document is a PDF. Automatic checks need a photo (JPG/PNG); ask the seller to re-upload as an image" };
  const res = await fetch(signedDocumentUrl(doc), { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) return { problem: "Could not read the stored document" };
  return { buffer: Buffer.from(await res.arrayBuffer()), mime: MIME[format] };
};

const testMode = (details?: Record<string, string>): CheckOutcome => ({ status: "TestMode", summary: TEST_MODE_NOTE, details });
const apiProblem = (message?: string, transient?: boolean): CheckOutcome => ({
  status: transient ? "Error" : "Failed",
  summary: transient ? `Could not run the check: ${message}` : `APIclub rejected the check: ${message}`,
});

/** An OCR call that APIclub declines usually means the image couldn't be read — not that the seller's data is wrong. */
const ocrProblem = (message?: string, transient?: boolean): CheckOutcome =>
  transient
    ? apiProblem(message, true)
    : { status: "Inconclusive", summary: `The document couldn't be read automatically (${message}). Check it by eye or ask for a clearer photo.` };

const runPan = async (seller: ISeller): Promise<CheckOutcome> => {
  if (!seller.panCard) return { status: "Inconclusive", summary: "The seller hasn't entered a PAN yet" };
  const img = await loadImage(seller, "PAN_CARD");
  if ("problem" in img) return { status: "Inconclusive", summary: img.problem };

  const res = await ocrPan(img);
  if (!res.ok) return ocrProblem(res.message, res.transient);
  if (apiclubIsTestEnvironment()) return testMode();

  const onCard = (res.data?.pan_no || "").toUpperCase().replace(/\s/g, "");
  const nameOnCard = res.data?.registered_name || "";
  const similarity = nameSimilarity(nameOnCard, seller.legalBusinessName || seller.sellerName);
  const details = { pan_on_card: onCard || "unreadable", pan_entered: seller.panCard, name_on_card: nameOnCard, name_match: pct(similarity) };

  if (!onCard) return { status: "Inconclusive", summary: "The PAN could not be read from the card image", details };
  if (onCard !== seller.panCard) return { status: "Failed", summary: "The PAN on the card does not match the PAN entered", details };
  if (similarity < NAME_MATCH_MIN) {
    return { status: "Inconclusive", summary: `PAN matches, but the name on the card differs from "${seller.legalBusinessName || seller.sellerName}"`, details };
  }
  return { status: "Passed", summary: "PAN and name on the card match what the seller entered", details };
};

const runCheque = async (seller: ISeller): Promise<CheckOutcome> => {
  if (!seller.accountNumber || !seller.ifsc) return { status: "Inconclusive", summary: "The seller hasn't entered bank details yet" };
  const img = await loadImage(seller, "CANCELLED_CHEQUE");
  if ("problem" in img) return { status: "Inconclusive", summary: img.problem };

  const res = await ocrCheque(img);
  if (!res.ok) return ocrProblem(res.message, res.transient);
  if (apiclubIsTestEnvironment()) return testMode();

  const chequeAcc = digits(res.data?.beneficiary_account);
  const chequeIfsc = (res.data?.beneficiary_ifsc || "").toUpperCase();
  const similarity = nameSimilarity(res.data?.beneficiary_name, seller.accountName);
  const accountMatches = chequeAcc.length >= 4 && (chequeAcc.length === seller.accountNumber.length ? chequeAcc === seller.accountNumber : seller.accountNumber.endsWith(chequeAcc.slice(-4)));
  const details = {
    account_on_cheque: chequeAcc ? maskAccountNumber(chequeAcc) : "unreadable",
    account_entered: maskAccountNumber(seller.accountNumber),
    ifsc_on_cheque: chequeIfsc || "unreadable",
    ifsc_entered: seller.ifsc,
    name_on_cheque: res.data?.beneficiary_name || "",
    name_match: pct(similarity),
  };

  if (!chequeAcc && !chequeIfsc) return { status: "Inconclusive", summary: "Nothing could be read from the cheque image", details };
  if ((chequeAcc && !accountMatches) || (chequeIfsc && chequeIfsc !== seller.ifsc)) {
    return { status: "Failed", summary: "The account number or IFSC on the cheque does not match what the seller entered", details };
  }
  if (similarity < NAME_MATCH_MIN) return { status: "Inconclusive", summary: "Account and IFSC match, but the name on the cheque differs from the account holder name", details };
  return { status: "Passed", summary: "Account number, IFSC and name on the cheque match", details };
};

const runBank = async (seller: ISeller): Promise<CheckOutcome> => {
  if (!seller.accountName || !seller.accountNumber || !seller.ifsc) {
    return { status: "Inconclusive", summary: "The seller hasn't entered complete bank details yet" };
  }
  const res = await verifyBankPennyless({ name: seller.accountName, accno: seller.accountNumber, ifsc: seller.ifsc });
  if (!res.ok) return apiProblem(res.message, res.transient);
  if (apiclubIsTestEnvironment()) return testMode();

  const accountStatus = res.data?.account_details?.account_status;
  if (accountStatus && accountStatus.toUpperCase() !== "ACTIVE") {
    return { status: "Failed", summary: `The bank reports this account as ${accountStatus}` };
  }

  const holder = res.data?.account_details?.beneficiary_name || "";
  const similarity = Math.max(
    nameSimilarity(holder, seller.accountName),
    nameSimilarity(holder, seller.legalBusinessName || seller.sellerName)
  );
  const details = { account: maskAccountNumber(seller.accountNumber), holder_per_bank: holder, name_entered: seller.accountName, name_match: pct(similarity), bank: res.data?.account_details?.bank_name || "" };
  if (!holder) return { status: "Inconclusive", summary: "The account exists but the bank returned no holder name", details };
  if (similarity < NAME_MATCH_MIN) return { status: "Failed", summary: `The bank lists the account holder as "${holder}", which doesn't match the name entered`, details };
  return { status: "Passed", summary: "The account exists and the holder name matches", details };
};

const runFace = async (seller: ISeller): Promise<CheckOutcome> => {
  const card = await loadImage(seller, "PAN_CARD");
  if ("problem" in card) return { status: "Inconclusive", summary: card.problem };
  const selfie = await loadImage(seller, "SELFIE");
  if ("problem" in selfie) return { status: "Inconclusive", summary: selfie.problem };

  const res = await faceMatch(card, selfie);
  if (!res.ok) return apiProblem(res.message, res.transient);
  if (apiclubIsTestEnvironment()) return testMode();

  const score = parseFloat(res.data?.match_score || "");
  if (!Number.isFinite(score)) return { status: "Inconclusive", summary: "APIclub returned no match score" };
  const details = { match_score: score.toFixed(1), threshold: String(faceThreshold()) };
  return score >= faceThreshold()
    ? { status: "Passed", summary: `The selfie matches the photo on the PAN card (score ${score.toFixed(1)})`, details }
    : { status: "Failed", summary: `The selfie does not clearly match the PAN card photo (score ${score.toFixed(1)}, needs ${faceThreshold()})`, details };
};

const RUNNERS: Record<VerificationCheckType, (seller: ISeller) => Promise<CheckOutcome>> = {
  PAN: runPan,
  CHEQUE: runCheque,
  BANK: runBank,
  FACE: runFace,
};

/** Runs the requested checks one after another, stores each latest result and audits the run. */
export const runVerificationChecks = async (
  seller: ISeller,
  requested: unknown,
  actor: { actorId?: any; actorName?: string }
): Promise<IVerificationCheck[]> => {
  const types = (Array.isArray(requested) && requested.length ? requested : [...VERIFICATION_CHECK_TYPES]).filter(
    (t): t is VerificationCheckType => (VERIFICATION_CHECK_TYPES as readonly string[]).includes(t)
  );
  if (!apiclubConfigured()) {
    const err: any = new Error("Automatic verification isn't set up yet. Add APICLUB_API_KEY to the server's environment.");
    err.statusCode = 503;
    throw err;
  }

  const results: IVerificationCheck[] = [];
  for (const type of types) {
    let outcome: CheckOutcome;
    try {
      outcome = await RUNNERS[type](seller);
    } catch (err: any) {
      console.error(`[Verification] ${type} check crashed:`, err?.message);
      outcome = { status: "Error", summary: "The check failed unexpectedly. Please try again." };
    }
    results.push({ type, ...outcome, ranAt: new Date(), ranBy: actor.actorName });
  }

  seller.verificationChecks = [
    ...(seller.verificationChecks || []).filter((c) => !types.includes(c.type)),
    ...results,
  ];
  await seller.save();

  await auditSeller({
    sellerId: seller._id,
    actorType: "Admin",
    actorId: actor.actorId,
    actorName: actor.actorName,
    action: "VERIFICATION_RUN",
    changes: results.map((r) => ({ field: r.type, to: r.status })),
  });
  return results;
};
