import { Request, Response } from "express";
import { asyncHandler } from "../../../utils/asyncHandler";
import { REPORT_PRESETS, ReportPeriodError, resolveReportPeriod } from "../../../services/reportPeriodService";
import { buildSellerIncomeReport, buildSellerIncomeXlsx } from "../../../services/sellerIncomeReportService";
import { buildTcsZip } from "../../../services/gstTcsReportService";
import { XLSX_MIME } from "../../../utils/xlsx";

/**
 * Seller panel > Reports: income statement (on screen + Excel) and the GST/TCS report
 * (zip of two Excel files) for a period from the shared date filter.
 */

const periodOr400 = (req: Request, res: Response) => {
  try {
    return resolveReportPeriod(req.query as any);
  } catch (err: any) {
    if (err instanceof ReportPeriodError) {
      res.status(400).json({ success: false, message: err.message });
      return null;
    }
    throw err;
  }
};

export const sendFile = (res: Response, fileName: string, mime: string, buffer: Buffer) => {
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(buffer);
};

/** GET /seller/reports/income — the brief shown on screen (first 100 order lines). */
export const getMyIncomeReport = asyncHandler(async (req: Request, res: Response) => {
  const period = periodOr400(req, res);
  if (!period) return;
  const report = await buildSellerIncomeReport(String((req as any).user.userId), period);
  return res.status(200).json({
    success: true,
    data: { ...report, orders: report.orders.slice(-100).reverse(), orderCount: report.orders.length, wallet: undefined, presets: REPORT_PRESETS },
  });
});

/** GET /seller/reports/income/download — Excel workbook. */
export const downloadMyIncomeReport = asyncHandler(async (req: Request, res: Response) => {
  const period = periodOr400(req, res);
  if (!period) return;
  const { fileName, buffer } = await buildSellerIncomeXlsx(String((req as any).user.userId), period);
  return sendFile(res, fileName, XLSX_MIME, buffer);
});

/** GET /seller/reports/gst/download — zip with tcs_sales.xlsx and tcs_sales_return.xlsx. */
export const downloadMyGstReport = asyncHandler(async (req: Request, res: Response) => {
  const period = periodOr400(req, res);
  if (!period) return;
  const { fileName, buffer } = await buildTcsZip(period, [String((req as any).user.userId)]);
  return sendFile(res, fileName, "application/zip", buffer);
});
