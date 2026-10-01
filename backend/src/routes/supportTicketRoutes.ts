import { Router } from "express";
import {
  createTicket,
  getMyTickets,
  getMyTicketById,
  replyToTicketAsSeller,
} from "../modules/seller/controllers/supportTicketController";
import { authenticate, requireUserType, requireApprovedUser } from "../middleware/auth";

const router = Router();

router.use(authenticate);
router.use(requireUserType("Seller"));
router.use(requireApprovedUser);

router.post("/", createTicket);
router.get("/my", getMyTickets);
router.get("/my/:id", getMyTicketById);
router.post("/my/:id/reply", replyToTicketAsSeller);

export default router;
