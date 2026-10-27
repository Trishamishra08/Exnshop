import Seller from "../models/Seller";

/**
 * Ship-by and deliver-by dates for courier (E-commerce) orders, worked out from
 * the seller's own handling settings: when they work, when they stop taking the
 * day's orders, how long packing takes, and their holidays. All dates are India
 * dates (IST) since that is where the sellers and customers are.
 */

export interface HandlingSettings {
  handlingTimeDays: number;
  operatingDays: number[];
  holidays: string[];
  orderCutoffTime: string;
}

export const DEFAULT_HANDLING: HandlingSettings = {
  handlingTimeDays: 1,
  operatingDays: [1, 2, 3, 4, 5, 6], // Monday to Saturday
  holidays: [],
  orderCutoffTime: "17:00",
};

/** Days a courier takes from pickup to the customer, added after the ship-by date. */
export const TRANSIT_DAYS = 4;

const IST_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The India calendar date of an instant, as { ymd, weekday, minutes since midnight }. */
const istParts = (d: Date) => {
  const ist = new Date(d.getTime() + IST_MS);
  const ymd = ist.toISOString().slice(0, 10);
  return { ymd, weekday: ist.getUTCDay(), minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes() };
};

const addDaysYmd = (ymd: string, days: number): string => new Date(new Date(`${ymd}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
const weekdayOf = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay();
/** Last moment of an India calendar day. */
export const endOfIstDay = (ymd: string) => new Date(new Date(`${ymd}T23:59:59.999Z`).getTime() - IST_MS);
export const todayIst = (now: Date = new Date()) => istParts(now).ymd;

export const normalizeHandling = (seller: any): HandlingSettings => {
  const operatingDays = Array.isArray(seller?.operatingDays) && seller.operatingDays.length ? seller.operatingDays : DEFAULT_HANDLING.operatingDays;
  return {
    handlingTimeDays: Number.isInteger(seller?.handlingTimeDays) ? seller.handlingTimeDays : DEFAULT_HANDLING.handlingTimeDays,
    operatingDays,
    holidays: Array.isArray(seller?.holidays) ? seller.holidays : [],
    orderCutoffTime: /^\d{2}:\d{2}$/.test(seller?.orderCutoffTime || "") ? seller.orderCutoffTime : DEFAULT_HANDLING.orderCutoffTime,
  };
};

export const getHandlingSettings = async (sellerId: string): Promise<HandlingSettings> => {
  const seller = await Seller.findById(sellerId).select("handlingTimeDays operatingDays holidays orderCutoffTime").lean();
  return normalizeHandling(seller);
};

const isWorkingDay = (ymd: string, s: HandlingSettings) => s.operatingDays.includes(weekdayOf(ymd)) && !s.holidays.includes(ymd);

const nextWorkingDay = (ymd: string, s: HandlingSettings): string => {
  let d = ymd;
  for (let i = 0; i < 400; i++) {
    d = addDaysYmd(d, 1);
    if (isWorkingDay(d, s)) return d;
  }
  return d;
};

/**
 * Ship-by (India date, YYYY-MM-DD): the order counts as received on the first
 * working day it can be picked up (the same day if placed before the cut-off on
 * a working day, otherwise the next one); then `handlingTimeDays` more working
 * days are allowed for packing and handover.
 */
export const computeShipBy = (orderDate: Date, s: HandlingSettings): string => {
  const { ymd, minutes } = istParts(orderDate);
  const [ch, cm] = s.orderCutoffTime.split(":").map(Number);
  const beforeCutoff = minutes <= ch * 60 + cm;
  let received = ymd;
  if (!isWorkingDay(ymd, s) || !beforeCutoff) received = nextWorkingDay(ymd, s);
  let shipBy = received;
  for (let i = 0; i < s.handlingTimeDays; i++) shipBy = nextWorkingDay(shipBy, s);
  return shipBy;
};

/** Order statuses where the parcel hasn't left the seller yet. */
export const UNSHIPPED_STATUSES = ["Received", "Pending", "Accepted", "Processed"];

export type ShipState = "late" | "today" | "tomorrow" | "ok";

export interface ShipDates {
  shipByDate: string; // YYYY-MM-DD
  deliverByDate: string;
  shipState: ShipState | null; // null once the parcel has shipped (or the order is closed)
}

export const shipDatesFor = (order: { orderDate?: Date; createdAt?: Date; status: string }, s: HandlingSettings, now: Date = new Date()): ShipDates => {
  const placed = (order.orderDate || order.createdAt || now) as Date;
  const shipByDate = computeShipBy(new Date(placed), s);
  const deliverByDate = addDaysYmd(shipByDate, TRANSIT_DAYS);
  let shipState: ShipState | null = null;
  if (UNSHIPPED_STATUSES.includes(order.status)) {
    const today = todayIst(now);
    if (shipByDate < today) shipState = "late";
    else if (shipByDate === today) shipState = "today";
    else if (shipByDate === addDaysYmd(today, 1)) shipState = "tomorrow";
    else shipState = "ok";
  }
  return { shipByDate, deliverByDate, shipState };
};

export const validateHandlingInput = (input: any): { ok: true; value: Partial<HandlingSettings & { defaultCourier: string }> } | { ok: false; message: string } => {
  const out: any = {};
  if (input.handlingTimeDays !== undefined) {
    const n = Number(input.handlingTimeDays);
    if (!Number.isInteger(n) || n < 0 || n > 7) return { ok: false, message: "Handling time must be a whole number of days from 0 to 7" };
    out.handlingTimeDays = n;
  }
  if (input.operatingDays !== undefined) {
    const days: number[] = Array.isArray(input.operatingDays) ? [...new Set<number>(input.operatingDays.map(Number))] : [];
    if (days.length === 0 || days.some((d: number) => !Number.isInteger(d) || d < 0 || d > 6)) return { ok: false, message: "Choose at least one working day" };
    out.operatingDays = days.sort((a: number, b: number) => a - b);
  }
  if (input.orderCutoffTime !== undefined) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(input.orderCutoffTime))) return { ok: false, message: "Cut-off time must be like 17:00" };
    out.orderCutoffTime = String(input.orderCutoffTime);
  }
  if (input.holidays !== undefined) {
    const list = Array.isArray(input.holidays) ? input.holidays.map(String) : [];
    if (list.length > 60 || list.some((d: string) => !/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(new Date(`${d}T00:00:00Z`).getTime()))) {
      return { ok: false, message: "Holidays must be valid dates (maximum 60)" };
    }
    out.holidays = [...new Set(list)].sort();
  }
  if (input.defaultCourier !== undefined) out.defaultCourier = String(input.defaultCourier).trim().slice(0, 60);
  return { ok: true, value: out };
};
