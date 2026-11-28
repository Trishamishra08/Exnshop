import { Request, Response } from "express";
import mongoose from "mongoose";
import Seller from "../../../models/Seller";
import { asyncHandler } from "../../../utils/asyncHandler";
import { REPORT_PRESETS, ReportPeriodError, resolveReportPeriod } from "../../../services/reportPeriodService";
import { buildAdminFullReport, buildAdminFullXlsx } from "../../../services/adminFullReportService";
import { buildSellerIncomeReport, buildSellerIncomeXlsx } from "../../../services/sellerIncomeReportService";
import { buildTcsZip } from "../../../services/gstTcsReportService";
import { sendSellerReportEmail } from "../../../services/emailService";
import { sendFile } from "../../seller/controllers/sellerReportsController";
import { XLSX_MIME } from "../../../utils/xlsx";

/**
 * Admin > Reports downloads: the platform report (Excel), sellers' GST/TCS reports (zip),
 * a chosen seller's income report, and sending a seller their reports by email.
 */

const periodFrom = (src: any, res: Response) => {
  try {
    return resolveReportPeriod(src);
  } catch (err: any) {
    if (err instanceof ReportPeriodError) {
      res.status(400).json({ success: false, message: err.message });
      return null;
    }
    throw err;
  }
};

const validSellerId = (id: any) => mongoose.isValidObjectId(String(id || ""));
const money = (n: number) => `₹${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** GET /admin/reports/platform — on-screen summary. */
export const getPlatformReport = asyncHandler(async (req: Request, res: Response) => {
  const period = periodFrom(req.query, res);
  if (!period) return;
  const report = await buildAdminFullReport(period);
  return res.status(200).json({
    success: true,
    data: { ...report, ledger: undefined, ledgerCount: report.ledger.length, sellers: report.sellers.slice(0, 50), presets: REPORT_PRESETS },
  });
});

/** GET /admin/reports/platform/download — Excel workbook. */
export const downloadPlatformReport = asyncHandler(async (req: Request, res: Response) => {
  const period = periodFrom(req.query, res);
  if (!period) return;
  const { fileName, buffer } = await buildAdminFullXlsx(period);
  return sendFile(res, fileName, XLSX_MIME, buffer);
});

/** GET /admin/reports/gst/download?sellerId= — GST/TCS zip for one seller, or all sellers. */
export const downloadGstReportAdmin = asyncHandler(async (req: Request, res: Response) => {
  const period = periodFrom(req.query, res);
  if (!period) return;
  const sellerId = req.query.sellerId ? String(req.query.sellerId) : "";
  if (sellerId && !validSellerId(sellerId)) return res.status(400).json({ success: false, message: "Invalid seller" });
  const { fileName, buffer } = await buildTcsZip(period, sellerId ? [sellerId] : undefined);
  return sendFile(res, fileName, "application/zip", buffer);
});

/** GET /admin/reports/sellers?search=&status= — pick a seller for their report. */
export const searchSellersForReport = asyncHandler(async (req: Request, res: Response) => {
  const search = String(req.query.search || "").trim();
  const status = String(req.query.status || "").trim();
  const query: any = {};
  if (status) query.status = status;
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    query.$or = [{ storeName: rx }, { sellerName: rx }, { email: rx }, { mobile: rx }, { gstin: rx }, { city: rx }];
    if (validSellerId(search)) query.$or.push({ _id: search });
  }
  const sellers = await Seller.find(query)
    .select("storeName sellerName email mobile gstin city status")
    .sort({ storeName: 1 })
    .limit(30)
    .lean();
  return res.status(200).json({
    success: true,
    data: sellers.map((s: any) => ({
      id: String(s._id),
      storeName: s.storeName || "",
      sellerName: s.sellerName || "",
      email: s.email || "",
      mobile: s.mobile || "",
      gstin: s.gstin || "",
      city: s.city || "",
      status: s.status || "",
    })),
  });
});

/** GET /admin/reports/sellers/:sellerId/income — the seller's income brief (as they see it). */
export const getSellerIncomeAdmin = asyncHandler(async (req: Request, res: Response) => {
  if (!validSellerId(req.params.sellerId)) return res.status(400).json({ success: false, message: "Invalid seller" });
  const period = periodFrom(req.query, res);
  if (!period) return;
  const report = await buildSellerIncomeReport(req.params.sellerId, period);
  return res.status(200).json({ success: true, data: { ...report, orders: report.orders.slice(-100).reverse(), orderCount: report.orders.length, wallet: undefined } });
});

/** GET /admin/reports/sellers/:sellerId/income/download — Excel workbook. */
export const downloadSellerIncomeAdmin = asyncHandler(async (req: Request, res: Response) => {
  if (!validSellerId(req.params.sellerId)) return res.status(400).json({ success: false, message: "Invalid seller" });
  const period = periodFrom(req.query, res);
  if (!period) return;
  const { fileName, buffer } = await buildSellerIncomeXlsx(req.params.sellerId, period);
  return sendFile(res, fileName, XLSX_MIME, buffer);
});

/**
 * POST /admin/reports/sellers/:sellerId/send
 * body: { preset, from?, to?, income?: boolean, gst?: boolean, note?: string }
 * Emails the seller their reports as attachments and adds a notification in their panel.
 */
export const sendSellerReport = asyncHandler(async (req: Request, res: Response) => {
  const { sellerId } = req.params;
  if (!validSellerId(sellerId)) return res.status(400).json({ success: false, message: "Invalid seller" });
  const period = periodFrom(req.body || {}, res);
  if (!period) return;
  const wantIncome = req.body?.income !== false;
  const wantGst = req.body?.gst !== false;
  if (!wantIncome && !wantGst) return res.status(400).json({ success: false, message: "Choose at least one report to send." });
  const note = String(req.body?.note || "").slice(0, 1000);

  const seller: any = await Seller.findById(sellerId).select("storeName sellerName email").lean();
  if (!seller) return res.status(404).json({ success: false, message: "Seller not found" });
  if (!seller.email) return res.status(400).json({ success: false, message: "This seller has no email address on their account." });

  const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];
  const lines: Array<[string, string]> = [["Period", `${period.label}`]];
  if (wantIncome) {
    const { report, fileName, buffer } = await buildSellerIncomeXlsx(sellerId, period);
    attachments.push({ filename: fileName, content: buffer, contentType: XLSX_MIME });
    const s = report.summary;
    lines.push(
      ["Orders", String(s.orders)],
      ["Gross sales (incl. GST)", money(s.grossSales)],
      ["Commission", money(s.commission)],
      ["Courier charges", money(s.courierCharges)],
      ["Other charges (ads, pickups …)", money(s.walletCharges)],
      ["Net income", money(s.netIncome)],
      ["Paid to your bank", money(s.paidToBank)],
    );
  }
  if (wantGst) {
    const { report, fileName, buffer } = await buildTcsZip(period, [sellerId]);
    attachments.push({ filename: fileName, content: buffer, contentType: "application/zip" });
    lines.push(["GST: net taxable value", money(report.totals.netTaxable)], ["GST: net tax", money(report.totals.netTax)]);
  }

  const mail = await sendSellerReportEmail(seller.email, {
    storeName: seller.storeName || seller.sellerName || "Seller",
    periodLabel: period.label,
    lines,
    note,
    attachments,
  });
  if (!mail.success) {
    return res.status(502).json({ success: false, message: `The email could not be sent: ${mail.error || "mail server error"}` });
  }

  try {
    const { sendNotification } = await import("../../../services/notificationService");
    await sendNotification(
      "Seller",
      sellerId,
      `Your report for ${period.label}`,
      `Exnshop emailed your ${[wantIncome && "income", wantGst && "GST"].filter(Boolean).join(" and ")} report to ${seller.email}. You can also download it from Reports.`,
      { type: "Info", link: "/seller/reports/income", priority: "Medium" } as any
    );
  } catch (err: any) {
    console.error("[Reports] Seller notification failed:", err?.message);
  }

  return res.status(200).json({ success: true, message: `Report sent to ${seller.email}` });
});
