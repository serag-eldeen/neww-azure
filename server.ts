import express from "express";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import { createServer as createViteServer } from "vite";
import { PrismaClient, UserRole, DoctorRole, AppointmentStatus, VisitType, PaymentMethod, TreatmentStatus, InvoiceStatus, InventoryStatus, NotificationPriority, NotificationType, ToothCondition, AuditLogAction, AuditLogStatus } from "@prisma/client";
import { z } from "zod";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import dotenv from "dotenv";
import helmet from "helmet";
import nodemailer from "nodemailer";
import compression from "compression";

dotenv.config();

// Critical environment variable assertions & dynamic fallback key generation
if (!process.env.DATABASE_URL) {
  console.warn("WARNING: DATABASE_URL environment variable is missing! Falling back to local JSON DB mode.");
}

let JWT_SECRET = process.env.JWT_SECRET || "";
let JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "";

if (!JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    console.error("CRITICAL SECURITY ERROR: JWT_SECRET environment variable is missing in production! Exiting to prevent insecure JWT generation.");
    process.exit(1);
  } else {
    JWT_SECRET = crypto.randomBytes(32).toString("hex");
    console.warn("⚠️ JWT_SECRET environment variable is missing in development. Generated a secure runtime fallback JWT_SECRET.");
  }
}

if (!JWT_REFRESH_SECRET) {
  if (process.env.NODE_ENV === "production") {
    console.error("CRITICAL SECURITY ERROR: JWT_REFRESH_SECRET environment variable is missing in production! Exiting to prevent insecure JWT generation.");
    process.exit(1);
  } else {
    JWT_REFRESH_SECRET = crypto.randomBytes(32).toString("hex");
    console.warn("⚠️ JWT_REFRESH_SECRET environment variable is missing in development. Generated a secure runtime fallback JWT_REFRESH_SECRET.");
  }
}

// Initialize Nodemailer transporter with Gmail SMTP parameters
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT || 465),
  secure: Number(process.env.SMTP_PORT || 465) === 465,
  auth: {
    user: process.env.SMTP_USER || "your_email@gmail.com",
    pass: process.env.SMTP_PASS || ""
  }
});

// Helper function to send the bilingual verification email with a 24-hour token
async function sendVerificationEmail(email: string, name: string, token: string) {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const activationLink = `${appUrl}/verify-email?token=${token}`;

  const mailOptions = {
    from: process.env.EMAIL_FROM || '"Azure Dental Clinic" <your_email@gmail.com>',
    to: email,
    subject: "تفعيل حسابك في عيادة Azure للأسنان | Activate Your Azure Dental Clinic Account",
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; direction: rtl; text-align: right; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
        <h2 style="color: #0f172a; text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">عيادة Azure لطب الأسنان</h2>
        <p style="font-size: 16px; color: #334155;">عزيزنا <strong>${name}</strong>،</p>
        <p style="font-size: 14px; color: #475569; line-height: 1.6;">
          شكراً لتسجيلك في عيادة Azure للأسنان. لتفعيل حسابك والتمكن من حجز مواعيدك ومتابعة ملفك الطبي، يرجى الضغط على الرابط التالي:
        </p>
        <div style="text-align: center; margin: 25px 0;">
          <a href="${activationLink}" style="background-color: #3b82f6; color: #ffffff; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 6px; font-size: 14px; display: inline-block;">تفعيل الحساب الآن</a>
        </div>
        <p style="font-size: 12px; color: #64748b;">
          هذا الرابط صالح لمدة 24 ساعة فقط. إذا لم تقم بالتسجيل، يرجى تجاهل هذا البريد.
        </p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <div style="direction: ltr; text-align: left; color: #475569; font-size: 14px; line-height: 1.6;">
          <p>Dear <strong>${name}</strong>,</p>
          <p>Thank you for registering at Azure Dental Clinic. To activate your account and access your bookings and medical files, please click the link below:</p>
          <div style="text-align: center; margin: 20px 0;">
            <a href="${activationLink}" style="background-color: #3b82f6; color: #ffffff; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 6px; font-size: 14px; display: inline-block;">Activate Account Now</a>
          </div>
          <p style="font-size: 12px; color: #64748b;">This link is valid for 24 hours. If you did not register, please ignore this email.</p>
        </div>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
}

// Enums Mapper Helpers for 3NF Database & Legacy Frontend compatibility
function mapUserRoleToEnum(val: string): UserRole {
  const v = val.toUpperCase().trim();
  if (v === "SUPER_ADMIN") return UserRole.SUPER_ADMIN;
  if (v === "ADMIN") return UserRole.ADMIN;
  if (v === "DOCTOR") return UserRole.DOCTOR;
  if (v === "RECEPTIONIST" || v === "STAFF") return UserRole.RECEPTIONIST;
  if (v === "PATIENT") return UserRole.PATIENT;
  return UserRole.RECEPTIONIST;
}

function mapUserRoleToDisplay(val: UserRole): string {
  if (val === UserRole.SUPER_ADMIN) return "SUPER_ADMIN";
  if (val === UserRole.ADMIN) return "Admin";
  if (val === UserRole.DOCTOR) return "Doctor";
  if (val === UserRole.RECEPTIONIST) return "Staff";
  if (val === UserRole.PATIENT) return "Patient";
  return "Staff";
}

function mapDoctorRoleToEnum(val: string): DoctorRole {
  const v = val.toUpperCase().trim();
  if (v.includes("CONSULTANT")) return DoctorRole.CONSULTANT;
  if (v.includes("SPECIALIST")) return DoctorRole.SPECIALIST;
  if (v.includes("ASSISTANT")) return DoctorRole.ASSISTANT;
  return DoctorRole.SPECIALIST;
}

function mapDoctorRoleToDisplay(val: DoctorRole): string {
  if (val === DoctorRole.CONSULTANT) return "Senior Consultant / Co-founder";
  if (val === DoctorRole.SPECIALIST) return "Senior Specialist / Co-founder";
  if (val === DoctorRole.ASSISTANT) return "Assistant Practitioner";
  return "Senior Specialist / Co-founder";
}

function mapAppointmentStatusToEnum(val: string): AppointmentStatus {
  const v = val.toUpperCase().trim();
  if (v === "SCHEDULED") return AppointmentStatus.SCHEDULED;
  if (v === "CONFIRMED") return AppointmentStatus.CONFIRMED;
  if (v === "COMPLETED") return AppointmentStatus.COMPLETED;
  if (v === "CANCELED" || v === "CANCELLED") return AppointmentStatus.CANCELED;
  if (v === "NO_SHOW" || v === "NOSHOW") return AppointmentStatus.NO_SHOW;
  return AppointmentStatus.SCHEDULED;
}

function mapAppointmentStatusToDisplay(val: AppointmentStatus): string {
  if (val === AppointmentStatus.SCHEDULED) return "Scheduled";
  if (val === AppointmentStatus.CONFIRMED) return "Confirmed";
  if (val === AppointmentStatus.COMPLETED) return "Completed";
  if (val === AppointmentStatus.CANCELED) return "Canceled";
  if (val === AppointmentStatus.NO_SHOW) return "No Show";
  return "Scheduled";
}

function mapVisitTypeToEnum(val: string): VisitType {
  const v = val.toUpperCase().trim();
  if (v === "CONSULTATION" || v === "CONSULT") return VisitType.CONSULTATION;
  if (v === "TREATMENT" || v === "TREAT") return VisitType.TREATMENT;
  if (v === "FOLLOW_UP" || v === "FOLLOWUP") return VisitType.FOLLOW_UP;
  if (v === "EMERGENCY") return VisitType.EMERGENCY;
  return VisitType.CONSULTATION;
}

function mapVisitTypeToDisplay(val: VisitType): string {
  if (val === VisitType.CONSULTATION) return "Consultation";
  if (val === VisitType.TREATMENT) return "Treatment";
  if (val === VisitType.FOLLOW_UP) return "FollowUp";
  if (val === VisitType.EMERGENCY) return "Emergency";
  return "Consultation";
}

function mapPaymentMethodToEnum(val: string): PaymentMethod {
  const v = val.toUpperCase().trim();
  if (v === "CASH") return PaymentMethod.CASH;
  if (v === "CARD") return PaymentMethod.CARD;
  if (v === "INSTAPAY") return PaymentMethod.INSTAPAY;
  if (v === "INSURANCE") return PaymentMethod.INSURANCE;
  return PaymentMethod.CASH;
}

function mapPaymentMethodToDisplay(val: PaymentMethod): string {
  if (val === PaymentMethod.CASH) return "Cash";
  if (val === PaymentMethod.CARD) return "Card";
  if (val === PaymentMethod.INSTAPAY) return "InstaPay";
  if (val === PaymentMethod.INSURANCE) return "Insurance";
  return "Cash";
}

function mapTreatmentStatusToEnum(val: string): TreatmentStatus {
  const v = val.toUpperCase().trim().replace(/\s+/g, "_");
  if (v === "PLANNED") return TreatmentStatus.PLANNED;
  if (v === "IN_PROGRESS") return TreatmentStatus.IN_PROGRESS;
  if (v === "COMPLETED") return TreatmentStatus.COMPLETED;
  if (v === "SUSPENDED") return TreatmentStatus.SUSPENDED;
  if (v === "CANCELLED" || v === "CANCELED") return TreatmentStatus.CANCELLED;
  return TreatmentStatus.IN_PROGRESS;
}

function mapTreatmentStatusToDisplay(val: TreatmentStatus): string {
  if (val === TreatmentStatus.PLANNED) return "Planned";
  if (val === TreatmentStatus.IN_PROGRESS) return "In Progress";
  if (val === TreatmentStatus.COMPLETED) return "Completed";
  if (val === TreatmentStatus.SUSPENDED) return "Suspended";
  if (val === TreatmentStatus.CANCELLED) return "Cancelled";
  return "In Progress";
}

function mapInvoiceStatusToEnum(val: string): InvoiceStatus {
  const v = val.toUpperCase().trim().replace(/\s+/g, "_");
  if (v === "PAID") return InvoiceStatus.PAID;
  if (v === "PARTIALLY_PAID") return InvoiceStatus.PARTIALLY_PAID;
  if (v === "UNPAID") return InvoiceStatus.UNPAID;
  if (v === "OVERDUE") return InvoiceStatus.OVERDUE;
  if (v === "CANCELLED" || v === "CANCELED") return InvoiceStatus.CANCELLED;
  return InvoiceStatus.UNPAID;
}

function mapInvoiceStatusToDisplay(val: InvoiceStatus): string {
  if (val === InvoiceStatus.PAID) return "Paid";
  if (val === InvoiceStatus.PARTIALLY_PAID) return "Partially Paid";
  if (val === InvoiceStatus.UNPAID) return "Unpaid";
  if (val === InvoiceStatus.OVERDUE) return "Overdue";
  if (val === InvoiceStatus.CANCELLED) return "Cancelled";
  return "Unpaid";
}

function mapInventoryStatusToEnum(val: string): InventoryStatus {
  const v = val.toUpperCase().trim().replace(/\s+/g, "_");
  if (v === "IN_STOCK") return InventoryStatus.IN_STOCK;
  if (v === "LOW_STOCK") return InventoryStatus.LOW_STOCK;
  if (v === "OUT_OF_STOCK") return InventoryStatus.OUT_OF_STOCK;
  return InventoryStatus.IN_STOCK;
}

function mapInventoryStatusToDisplay(val: InventoryStatus): string {
  if (val === InventoryStatus.IN_STOCK) return "In Stock";
  if (val === InventoryStatus.LOW_STOCK) return "Low Stock";
  if (val === InventoryStatus.OUT_OF_STOCK) return "Out of Stock";
  return "In Stock";
}

function mapToothConditionToEnum(val: string): ToothCondition {
  const v = val.toUpperCase().trim().replace(/\s+/g, "_");
  if (v === "HEALTHY") return ToothCondition.HEALTHY;
  if (v === "CAVITY") return ToothCondition.CAVITY;
  if (v === "FILLING") return ToothCondition.FILLING;
  if (v === "ROOT_CANAL") return ToothCondition.ROOT_CANAL;
  if (v === "EXTRACTION") return ToothCondition.EXTRACTION;
  if (v === "CROWN") return ToothCondition.CROWN;
  if (v === "BRIDGE") return ToothCondition.BRIDGE;
  if (v === "IMPLANT") return ToothCondition.IMPLANT;
  if (v === "ORTHODONTICS") return ToothCondition.ORTHODONTICS;
  if (v === "MISSING") return ToothCondition.MISSING;
  return ToothCondition.HEALTHY;
}

function mapToothConditionToDisplay(val: ToothCondition): string {
  if (val === ToothCondition.HEALTHY) return "Healthy";
  if (val === ToothCondition.CAVITY) return "Cavity";
  if (val === ToothCondition.FILLING) return "Filling";
  if (val === ToothCondition.ROOT_CANAL) return "Root Canal";
  if (val === ToothCondition.EXTRACTION) return "Extraction";
  if (val === ToothCondition.CROWN) return "Crown";
  if (val === ToothCondition.BRIDGE) return "Bridge";
  if (val === ToothCondition.IMPLANT) return "Implant";
  if (val === ToothCondition.ORTHODONTICS) return "Orthodontics";
  if (val === ToothCondition.MISSING) return "Missing";
  return "Healthy";
}

function mapNotificationPriorityToEnum(val: string): NotificationPriority {
  const v = val.toUpperCase().trim();
  if (v === "HIGH") return NotificationPriority.HIGH;
  if (v === "MEDIUM") return NotificationPriority.MEDIUM;
  if (v === "LOW") return NotificationPriority.LOW;
  return NotificationPriority.MEDIUM;
}

function mapNotificationPriorityToDisplay(val: NotificationPriority): string {
  if (val === NotificationPriority.HIGH) return "High";
  if (val === NotificationPriority.MEDIUM) return "Medium";
  if (val === NotificationPriority.LOW) return "Low";
  return "Medium";
}

function mapNotificationTypeToEnum(val: string): NotificationType {
  const v = val.toUpperCase().trim();
  if (v === "APPOINTMENTS" || v === "APPOINTMENT") return NotificationType.APPOINTMENTS;
  if (v === "PAYMENTS" || v === "PAYMENT" || v === "BILLING") return NotificationType.PAYMENTS;
  if (v === "INVENTORY") return NotificationType.INVENTORY;
  if (v === "GENERAL") return NotificationType.GENERAL;
  return NotificationType.GENERAL;
}

function mapNotificationTypeToDisplay(val: NotificationType): string {
  if (val === NotificationType.APPOINTMENTS) return "Appointments";
  if (val === NotificationType.PAYMENTS) return "Payments";
  if (val === NotificationType.INVENTORY) return "Inventory";
  if (val === NotificationType.GENERAL) return "General";
  return "General";
}

function mapAuditLogActionToEnum(val: string): AuditLogAction {
  const v = val.toUpperCase().trim();
  if (v === "LOGIN" || v === "LOGIN_SUCCESS") return AuditLogAction.LOGIN_SUCCESS;
  if (v === "LOGIN_FAILED") return AuditLogAction.LOGIN_FAILED;
  if (v === "LOGOUT") return AuditLogAction.LOGOUT;
  if (v === "LOGOUT_ALL_DEVICES") return AuditLogAction.LOGOUT_ALL_DEVICES;
  if (v === "REFRESH_REUSE_DETECTED") return AuditLogAction.REFRESH_REUSE_DETECTED;
  if (v === "CREATE_RECORD") return AuditLogAction.CREATE_RECORD;
  if (v === "UPDATE_RECORD") return AuditLogAction.UPDATE_RECORD;
  if (v === "DELETE_RECORD") return AuditLogAction.DELETE_RECORD;
  return AuditLogAction.CREATE_RECORD;
}

function mapAuditLogStatusToEnum(val: string): AuditLogStatus {
  const v = val.toUpperCase().trim();
  if (v === "SUCCESS") return AuditLogStatus.SUCCESS;
  if (v === "FAILURE") return AuditLogStatus.FAILURE;
  if (v === "REVOKED") return AuditLogStatus.REVOKED;
  return AuditLogStatus.SUCCESS;
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Set trust proxy to securely resolve client IP
app.set("trust proxy", 1);

// Register helmet for strict HTTP response security headers (CSP, HSTS, frame protection)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https://images.unsplash.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: [
        "'self'", 
        "http://localhost:3000", 
        "http://localhost:5173", 
        "https://ais-dev-cmjz5ycvyrlvz5ls3sbtyv-120604533321.europe-west3.run.app",
        "https://ais-pre-cmjz5ycvyrlvz5ls3sbtyv-120604533321.europe-west3.run.app",
        "https://ais-dev-2nxs6whh5q2mjgasc36p2r-120604533321.europe-west3.run.app",
        "https://ais-pre-2nxs6whh5q2mjgasc36p2r-120604533321.europe-west3.run.app",
        "https://*.run.app"
      ],
      frameAncestors: [
        "'self'", 
        "http://localhost:3000", 
        "http://localhost:5173", 
        "https://ais-dev-cmjz5ycvyrlvz5ls3sbtyv-120604533321.europe-west3.run.app",
        "https://ais-pre-cmjz5ycvyrlvz5ls3sbtyv-120604533321.europe-west3.run.app",
        "https://ais-dev-2nxs6whh5q2mjgasc36p2r-120604533321.europe-west3.run.app",
        "https://ais-pre-2nxs6whh5q2mjgasc36p2r-120604533321.europe-west3.run.app",
        "https://*.run.app",
        // Google AI Studio's own Build/Preview UI embeds the running app in an iframe from this origin
        "https://aistudio.google.com"
      ],
    }
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  frameguard: false
}));

// Register compression
app.use(compression());

// Register cookie-parser
app.use(cookieParser());

// Custom CORS Middleware with a strict allow-list to prevent unsafe wildcards or reflection
// Matches the same *.run.app pattern already trusted in the Helmet CSP (connectSrc/frameAncestors)
// via safe hostname parsing, instead of a hardcoded list that drifts out of sync with every new
// dev/preview Cloud Run revision hash.
function isAllowedOrigin(origin: string | undefined): origin is string {
  if (!origin) return false;

  const allowedExact = [
    process.env.FRONTEND_ORIGIN,
    "http://localhost:3000",
    "http://localhost:5173"
  ].filter(Boolean) as string[];

  if (allowedExact.includes(origin)) return true;

  try {
    const { protocol, hostname } = new URL(origin);
    // Any Cloud Run revision (dev/preview/prod) on *.run.app over HTTPS
    return protocol === "https:" && hostname.endsWith(".run.app");
  } catch {
    return false;
  }
}

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// Initialize Prisma Client
let prisma: PrismaClient | null = null;
let isMigrationComplete = false;
let dbInitializationPromise: Promise<void> = Promise.resolve();

if (process.env.DATABASE_URL) {
  try {
    let dbUrl = process.env.DATABASE_URL;
    // Inject connection_limit=5 if not already configured in the connection string
    if (!dbUrl.includes("connection_limit=")) {
      const separator = dbUrl.includes("?") ? "&" : "?";
      dbUrl = `${dbUrl}${separator}connection_limit=5`;
      console.log("Injected connection_limit=5 to DATABASE_URL for Cloud Run connection pool optimization.");
    }
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: dbUrl
        }
      }
    });

    // Run migrations in background so cold start is instantaneous and not blocked!
    dbInitializationPromise = (async () => {
      console.log("Background: Running prisma migrate deploy...");
      try {
        const { exec } = await import("child_process");
        await new Promise<void>((resolve, reject) => {
          exec("npx prisma migrate deploy", { timeout: 15000 }, (error, stdout, stderr) => {
            if (error) {
              console.error("Prisma migration execution error:", error);
              reject(error);
            } else {
              console.log("Prisma migrate deploy output:", stdout);
              if (stderr) console.warn("Prisma migrate deploy warnings:", stderr);
              resolve();
            }
          });
        });
        isMigrationComplete = true;
        console.log("Background: Prisma migrations applied successfully.");
        // Ensure rate_limits table exists for distributed rate limiting correctness
        try {
          if (prisma) {
            await prisma.$executeRawUnsafe(`
              CREATE TABLE IF NOT EXISTS rate_limits (
                key VARCHAR(255) PRIMARY KEY,
                count INTEGER NOT NULL,
                "resetTime" DOUBLE PRECISION NOT NULL
              )
            `);
            console.log("Background: rate_limits table verified/created in database.");
          }
        } catch (tableErr) {
          console.error("Background: Failed to ensure rate_limits table in database:", tableErr);
        }
      } catch (err) {
        console.error("Background: Prisma database migration failed or timed out:", err);
        if (process.env.NODE_ENV === "production") {
          console.error("CRITICAL DATABASE ERROR: Database migration failed in production. Exiting process.");
          process.exit(1);
        }
        prisma = null;
      }
    })();
  } catch (err) {
    console.error("Prisma client initialization failed:", err);
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }
    prisma = null;
  }
} else {
  console.log("DATABASE_URL not set. Running in file-json fallback mode.");
  if (process.env.NODE_ENV === "production") {
    console.error("CRITICAL DATABASE ERROR: DATABASE_URL environment variable is missing in production! Exiting to prevent silent fallback.");
    process.exit(1);
  }
  prisma = null;
}

// Enable tight global JSON body limits to mitigate DoS, with custom large parser for specific upload paths
app.use(express.json({ limit: "2mb" }));
const largeJsonParser = express.json({ limit: "50mb" });

// Non-blocking wait for background migrations on database requests
app.use(async (req, res, next) => {
  if (process.env.DATABASE_URL && prisma && !isMigrationComplete) {
    try {
      await dbInitializationPromise;
    } catch (err) {
      return res.status(503).json({ error: "Database is initializing, please try again shortly." });
    }
  }
  next();
});

// JWT Authentication Configuration
// JWT_SECRET and JWT_REFRESH_SECRET are dynamically declared and configured at the top of this file

// SHA-256 token hashing function (original token is never recoverable)
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Server-side calculation of patient spent/outstanding balance to prevent client-side spoofing (H-2, Phase 2)
async function recalculatePatientBalanceServer(patientId: string, txInput?: any) {
  const tx = txInput || prisma;
  try {
    const patient = await tx.patient.findUnique({
      where: { id: patientId }
    });
    if (!patient) return;

    // 1. Invoices Calculations
    const invoices = await tx.invoice.findMany({
      where: { patientId }
    });
    const patInvoices = invoices.filter((inv: any) => {
      const s = String(inv.status || "").toUpperCase();
      return s !== "CANCELLED" && s !== "CANCELED";
    });
    const invoiceTotalPaid = patInvoices.reduce((sum: number, inv: any) => sum + Number(inv.paidAmount || 0), 0);
    const invoiceTotalGross = patInvoices.reduce((sum: number, inv: any) => sum + Number(inv.totalAmount || 0), 0);
    const invoiceOutstanding = invoiceTotalGross - invoiceTotalPaid;

    // 2. Treatments Calculations (only count treatments not covered by invoices to prevent double counting)
    const treatments = await tx.treatment.findMany({
      where: { patientId }
    });
    const patTreatments = treatments.filter((t: any) => {
      const s = String(t.status || "").toUpperCase();
      return s !== "CANCELLED" && s !== "CANCELED";
    });
    const invoicePlanIds = patInvoices.map((inv: any) => inv.treatmentPlanId).filter(Boolean);
    const directTreatments = patTreatments.filter((t: any) => !invoicePlanIds.includes(t.id));
    const treatmentTotalPaid = directTreatments.reduce((sum: number, t: any) => sum + Number(t.paidAmount || 0), 0);
    const directTreatmentOutstanding = directTreatments.reduce((sum: number, t: any) => sum + Math.max(0, Number(t.totalCost || 0) - Number(t.paidAmount || 0)), 0);

    // 3. Consultation Fees (from completed appointments)
    const appointments = await tx.appointment.findMany({
      where: { patientId }
    });
    const patAppts = appointments.filter((app: any) => app.status === 'COMPLETED' || app.status === 'Completed');
    const invoiceApptIds = patInvoices.map((inv: any) => inv.appointmentId).filter(Boolean);
    const directAppts = patAppts.filter((app: any) => !invoiceApptIds.includes(app.id));
    const consultationsPaid = directAppts.reduce((sum: number, app: any) => sum + Number(app.consultationFee || 0), 0);

    const totalSpent = invoiceTotalPaid + treatmentTotalPaid + consultationsPaid;
    const outstandingBalance = Math.max(0, invoiceOutstanding + directTreatmentOutstanding);

    // 4. Last visit
    const visits = appointments
      .filter((app: any) => app.status === 'COMPLETED' || app.status === 'Completed' || app.status === 'CONFIRMED' || app.status === 'Confirmed')
      .map((app: any) => app.date.toISOString().slice(0, 10))
      .sort();
    const lastVisit = visits.length > 0 ? new Date(visits[visits.length - 1]) : patient.lastVisit;

    await tx.patient.update({
      where: { id: patientId },
      data: {
        totalSpent,
        outstandingBalance,
        lastVisit
      }
    });
  } catch (err) {
    console.error(`recalculatePatientBalanceServer failed for patient ${patientId}:`, err);
  }
}

// Express Request Extension Interface for authenticated context
export interface AuthenticatedRequest extends express.Request {
  user?: {
    id: string;
    role: string;
    email?: string;
  };
}

// Authentication Middleware relying on HttpOnly Cookies (crucial for iframe cross-origin contexts)
function authenticateToken(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) {
  const token = req.cookies?.accessToken || req.cookies?.access_token;

  if (!token) {
    return res.status(401).json({ error: "Access token is required" });
  }

  jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }, (err: any, decoded: any) => {
    if (err) {
      return res.status(401).json({ error: "Invalid or expired access token" });
    }
    req.user = decoded as any;
    next();
  });
}

// Role-Based Access Control (RBAC) Middleware
function requireRole(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const userRole = req.user.role.toUpperCase();
    const isAllowed = allowedRoles.some(role => role.toUpperCase() === userRole);
    if (!isAllowed) {
      return res.status(403).json({ error: `Forbidden: requires one of the following roles: ${allowedRoles.join(", ")}` });
    }
    next();
  };
}

// Audit Logging helper
async function createAuditLog(
  action: string,
  status: string,
  userId: string | null,
  email: string | null,
  req: express.Request,
  details?: string
) {
  try {
    const ipAddress = req.ip || null;
    const userAgent = req.headers["user-agent"] || null;

    if (prisma) {
      await prisma.auditLog.create({
        data: {
          action: mapAuditLogActionToEnum(action),
          status: mapAuditLogStatusToEnum(status),
          userId: userId || null,
          userEmail: email || null,
          ipAddress,
          userAgent,
          details: details || null,
        }
      });
    } else {
      console.log(`[AuditLog Fallback] Action: ${action}, Status: ${status}, User: ${userId || email}, IP: ${ipAddress}`);
    }
  } catch (err) {
    console.error("Failed to create audit log:", err);
  }
}

// Simple In-Memory Cache for near-static resources (like doctors list, systems, etc.)
interface CacheEntry {
  data: any;
  expiresAt: number;
}
const cacheStore = new Map<string, CacheEntry>();

function getCached(key: string): any | null {
  const entry = cacheStore.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.data;
  }
  return null;
}

function setCached(key: string, data: any, ttlMs: number = 60 * 1000): void {
  cacheStore.set(key, {
    data,
    expiresAt: Date.now() + ttlMs
  });
}

function invalidateCache(key: string): void {
  cacheStore.delete(key);
}

// Rate Limiting helper
interface RateLimitRecord {
  count: number;
  resetTime: number;
}
const rateLimitStore = new Map<string, RateLimitRecord>();

// Periodically prune expired rate limits to prevent memory leaks (L-4)
const rateLimitCleanupInterval = setInterval(async () => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) {
      rateLimitStore.delete(key);
    }
  }
  if (prisma) {
    try {
      await prisma.$executeRawUnsafe(`DELETE FROM rate_limits WHERE "resetTime" < $1`, now);
    } catch (err) {
      console.error("Failed to prune DB rate limits:", err);
    }
  }
}, 5 * 60 * 1000);
if (typeof rateLimitCleanupInterval.unref === "function") {
  rateLimitCleanupInterval.unref();
}

function rateLimiter(limit: number, windowMs: number) {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = req.ip || "unknown-ip";
    const key = `${req.path}:${ip}`;
    const now = Date.now();

    if (prisma) {
      try {
        const records = await prisma.$queryRawUnsafe<any[]>(
          `SELECT count, "resetTime" FROM rate_limits WHERE key = $1`,
          key
        );

        let count = 1;
        let resetTime = now + windowMs;

        if (records && records.length > 0) {
          const record = records[0];
          const recordResetTime = Number(record.resetTime);
          if (now > recordResetTime) {
            count = 1;
            resetTime = now + windowMs;
            await prisma.$executeRawUnsafe(
              `UPDATE rate_limits SET count = 1, "resetTime" = $1 WHERE key = $2`,
              resetTime,
              key
            );
          } else {
            count = record.count + 1;
            resetTime = recordResetTime;
            await prisma.$executeRawUnsafe(
              `UPDATE rate_limits SET count = count + 1 WHERE key = $1`,
              key
            );
          }
        } else {
          await prisma.$executeRawUnsafe(
            `INSERT INTO rate_limits (key, count, "resetTime") VALUES ($1, $2, $3)
             ON CONFLICT (key) DO UPDATE SET count = rate_limits.count + 1`,
            key,
            1,
            resetTime
          );
        }

        if (count > limit) {
          return res.status(429).json({
            error: "Too many requests. Please try again later.",
            retryAfter: Math.ceil((resetTime - now) / 1000)
          });
        }

        return next();
      } catch (err) {
        console.error("Database rate limiting failed, falling back to local memory rate limiting:", err);
      }
    }

    // Inline cleanup if store size grows large
    if (rateLimitStore.size > 1000) {
      for (const [k, r] of rateLimitStore.entries()) {
        if (now > r.resetTime) {
          rateLimitStore.delete(k);
        }
      }
    }

    let record = rateLimitStore.get(key);
    if (!record) {
      record = { count: 1, resetTime: now + windowMs };
      rateLimitStore.set(key, record);
      return next();
    }

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
      return next();
    }

    record.count++;
    if (record.count > limit) {
      return res.status(429).json({
        error: "Too many requests. Please try again later.",
        retryAfter: Math.ceil((record.resetTime - now) / 1000)
      });
    }

    next();
  };
}

// Zod schemas for input validation with safe coercion and empty string tolerance
const SafeString = z.string()
  .nullable()
  .optional()
  .transform(val => (val === "" || val === undefined || val === null) ? null : val);

const SafeEmail = z.string()
  .nullable()
  .optional()
  .refine(val => {
    if (val === "" || val === undefined || val === null) return true;
    return z.string().email().safeParse(val).success;
  }, {
    message: "Invalid email"
  })
  .transform(val => (val === "" || val === undefined || val === null) ? null : val);

const SafeNumber = z.union([z.number(), z.string()])
  .optional()
  .transform((val) => {
    if (val === undefined || val === null || val === "") return 0;
    const num = Number(val);
    return isNaN(num) ? 0 : num;
  });

const DoctorSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
  specialty: z.string(),
  role: z.string(),
  image: SafeString,
});

const PatientSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string(),
  email: SafeEmail.optional().nullable(),
  password: SafeString.optional().nullable(),
  bloodType: SafeString.optional().nullable(),
  emergencyContact: z.object({
    name: SafeString.optional().nullable(),
    phone: SafeString.optional().nullable(),
    relation: SafeString.optional().nullable(),
  }).nullable().optional(),
  medicalConditions: z.array(z.string()).optional().nullable(),
  allergies: z.array(z.string()).optional().nullable(),
  insurance: z.object({
    provider: SafeString.optional().nullable(),
    policyNumber: SafeString.optional().nullable(),
    discountPercent: SafeNumber.optional().nullable(),
  }).nullable().optional(),
  photoUrl: SafeString.optional().nullable(),
  isActive: z.boolean().optional().nullable(),
  totalSpent: SafeNumber.optional().nullable(),
  outstandingBalance: SafeNumber.optional().nullable(),
  lastVisit: SafeString.optional().nullable(),
});

const AppointmentSchema = z.object({
  id: z.string(),
  patientId: z.string(),
  patientName: z.string().optional(),
  patientPhone: z.string().optional(),
  doctorEmail: z.string(),
  doctorName: z.string().optional(),
  date: z.string(),
  time: z.string(),
  duration: z.number().optional(),
  visitType: z.string().optional(),
  chairId: z.string().optional(),
  consultationFee: z.number().optional(),
  paymentMethod: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().nullable().optional(),
  isOnline: z.boolean().optional(),
});

const TreatmentSessionSchema = z.object({
  id: z.string(),
  date: z.string(),
  notes: z.string().nullable().optional(),
  completed: z.boolean(),
  affectedTeeth: z.array(z.number()).optional(),
  toothCondition: z.string().nullable().optional(),
});

const TreatmentSchema = z.object({
  id: z.string(),
  patientId: z.string(),
  doctorId: z.string().nullable().optional(),
  title: z.string(),
  description: z.string().nullable().optional(),
  status: z.string(),
  totalCost: z.number().nonnegative(),
  paidAmount: z.number().nonnegative(),
  sessions: z.array(TreatmentSessionSchema).optional(),
});

const InvoiceItemSchema = z.object({
  id: z.string(),
  description: z.string(),
  quantity: z.number().nonnegative(),
  unitPrice: z.number().nonnegative(),
});

const PaymentSchema = z.object({
  id: z.string(),
  date: z.string(),
  amount: z.number().nonnegative(),
  method: z.string(),
  notes: z.string().nullable().optional(),
});

const InvoiceSchema = z.object({
  id: z.string(),
  patientId: z.string(),
  appointmentId: z.string().nullable().optional(),
  treatmentPlanId: z.string().nullable().optional(),
  date: z.string(),
  dueDate: z.string(),
  discount: z.number().nonnegative().optional(),
  tax: z.number().nonnegative().optional(),
  status: z.string(),
  totalAmount: z.number().nonnegative(),
  paidAmount: z.number().nonnegative(),
  items: z.array(InvoiceItemSchema).optional(),
  payments: z.array(PaymentSchema).optional(),
});

const ExpenseSchema = z.object({
  id: z.string(),
  category: z.string(),
  description: z.string().nullable().optional(),
  amount: z.number().nonnegative(),
  supplier: z.string().nullable().optional(),
  date: z.string(),
});

const InventorySchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  sku: z.string().nullable().optional(),
  quantity: z.number().nonnegative(),
  supplier: z.string().nullable().optional(),
  unitPrice: z.number().nonnegative(),
  minQuantity: z.number().nonnegative(),
  expirationDate: z.string().nullable().optional(),
  storageLocation: z.string().nullable().optional(),
  status: z.string(),
});

const NotificationSchema = z.object({
  id: z.string(),
  type: z.string(),
  priority: z.string(),
  title: z.string(),
  message: z.string(),
  read: z.boolean(),
  patientId: z.string().nullable().optional(),
  actionUrl: z.string().nullable().optional(),
  createdAt: z.string(),
});

const DentalChartSchema = z.object({
  patientId: z.string(),
  isChild: z.boolean().optional(),
  teeth: z.record(z.string(), z.any()),
});

// File Path for Local JSON DB fallback (only used if DATABASE_URL is missing)
const LOCAL_DB_PATH = path.join(process.cwd(), "db.json");

// Define Initial Seed Data
const DEFAULT_SEEDS: Record<string, any> = {
  doctors: [
    {
      id: 'doc-amr',
      name: 'Dr. Amr El-Adawy',
      email: 'amr.eladawy@gmail.com',
      specialty: 'Oral Surgery & Implants',
      role: 'Senior Consultant / Co-founder',
      image: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=600&h=800'
    },
    {
      id: 'doc-basel',
      name: 'Dr. Basel El-Morsy',
      email: 'basel.elmorsy@gmail.com',
      specialty: 'Cosmetic Dentistry & Orthodontics',
      role: 'Senior Specialist / Co-founder',
      image: 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&q=80&w=600&h=800'
    }
  ],
  patients: [
    {
      id: 'PAT-829402',
      name: 'سارة عبد الرحمن منصور',
      phone: '01039591109',
      email: 'sara@example.com',
      password: '123',
      bloodType: 'A+',
      emergencyContact: {
        name: 'أحمد منصور (الأب)',
        phone: '01012345678',
        relation: 'أب'
      },
      medicalConditions: ['حساسية ليفية خفيفة', 'ضغط دم منخفض'],
      allergies: ['البنسلين', 'مأكولات بحرية'],
      insurance: {
        provider: 'مصر للتأمين',
        policyNumber: 'MS-99402-A',
        discountPercent: 15
      },
      photoUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=150&h=150',
      isActive: true,
      totalSpent: 4500,
      outstandingBalance: 1200,
      lastVisit: '2026-06-20',
      createdAt: '2026-05-15T10:00:00.000Z'
    },
    {
      id: 'PAT-402941',
      name: 'محمد علي البدري',
      phone: '01124567890',
      email: 'mohamed@example.com',
      password: '123',
      bloodType: 'O+',
      emergencyContact: {
        name: 'منى البدري (الزوجة)',
        phone: '01198765432',
        relation: 'زوجة'
      },
      medicalConditions: ['سكري من النوع الثاني متحكم به'],
      allergies: [],
      insurance: {
        provider: 'لا يوجد تأمين نقدي',
        policyNumber: '',
        discountPercent: 0
      },
      photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=150&h=150',
      isActive: true,
      totalSpent: 12000,
      outstandingBalance: 4000,
      lastVisit: '2026-06-25',
      createdAt: '2026-04-10T11:30:00.000Z'
    },
    {
      id: 'PAT-119402',
      name: 'مازن يوسف كمال',
      phone: '01234511223',
      email: 'mazen@example.com',
      password: '123',
      bloodType: 'B-',
      emergencyContact: {
        name: 'كمال يوسف (الأب)',
        phone: '01234511220',
        relation: 'أب'
      },
      medicalConditions: [],
      allergies: ['الغبار'],
      insurance: {
        provider: 'أكسا للرعاية الطبية',
        policyNumber: 'AXA-DENT-8840',
        discountPercent: 20
      },
      photoUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=150&h=150',
      isActive: true,
      totalSpent: 0,
      outstandingBalance: 0,
      lastVisit: '2026-06-28',
      createdAt: '2026-06-28T09:00:00.000Z'
    }
  ],
  appointments: [
    {
      id: 'APP-1001',
      patientId: 'PAT-829402',
      patientName: 'سارة عبد الرحمن منصور',
      patientPhone: '01039591109',
      doctorEmail: 'amr.eladawy@gmail.com',
      doctorName: 'Dr. Amr El-Adawy',
      date: '2026-06-20',
      time: '15:30',
      duration: 30,
      visitType: 'Treatment',
      chairId: 'Chair 1',
      consultationFee: 200,
      paymentMethod: 'Cash',
      status: 'Completed',
      notes: 'جلسة تنظيف الجير الدورية وتلميع الأسنان',
      createdAt: '2026-06-18T10:00:00.000Z'
    },
    {
      id: 'APP-1002',
      patientId: 'PAT-402941',
      patientName: 'محمد علي البدري',
      patientPhone: '01124567890',
      doctorEmail: 'basel.elmorsy@gmail.com',
      doctorName: 'Dr. Basel El-Morsy',
      date: '2026-06-25',
      time: '18:00',
      duration: 60,
      visitType: 'Treatment',
      chairId: 'Chair 2',
      consultationFee: 200,
      paymentMethod: 'Card',
      status: 'Completed',
      notes: 'تحضير للتاج الزيركون النهائي للسن',
      createdAt: '2026-06-22T14:30:00.000Z'
    },
    {
      id: 'APP-1003',
      patientId: 'PAT-119402',
      patientName: 'مازن يوسف كمال',
      patientPhone: '01234511223',
      doctorEmail: 'amr.eladawy@gmail.com',
      doctorName: 'Dr. Amr El-Adawy',
      date: '2026-06-29',
      time: '14:00',
      duration: 45,
      visitType: 'Consultation',
      chairId: 'Chair 1',
      consultationFee: 250,
      paymentMethod: 'InstaPay',
      status: 'Confirmed',
      notes: 'كشف واستشارة زراعة أسنان رقمية',
      createdAt: '2026-06-28T09:15:00.000Z'
    }
  ],
  dental_charts: {},
  treatments: [
    {
      id: 'TRT-1001',
      patientId: 'PAT-829402',
      title: 'حشوات ضوئية تجميلية للضروس الخلفية السفلى',
      description: 'إزالة التسوس المتعمق في الضروس رقم 19 و 20 وبناء حشو كومبوزيت تجميلي',
      status: 'In Progress',
      totalCost: 1500,
      paidAmount: 500,
      createdAt: '2026-06-15T11:00:00.000Z',
      sessions: [
        {
          id: 'SES-001',
          date: '2026-06-15',
          notes: 'تم إزالة تسوس الضرس رقم 19 ووضع قاعدة حشو مهدئة',
          completed: true,
          affectedTeeth: [19],
          toothCondition: 'Filling'
        },
        {
          id: 'SES-002',
          date: '2026-06-22',
          notes: 'حشو نهائي للضرس 19 وجار فحص الضرس 20 الجلسة القادمة',
          completed: false,
          affectedTeeth: [20],
          toothCondition: 'Cavity'
        }
      ]
    },
    {
      id: 'TRT-1002',
      patientId: 'PAT-402941',
      title: 'علاج عصب فوري للضرس رقم 14 وتاج زيركون صلب',
      description: 'تنظيف ميكروسكوبي لقنوات العصب في الضرس 14 وتثبيت تاج زيركون ألماني تجميلي',
      status: 'Completed',
      totalCost: 6500,
      paidAmount: 6500,
      createdAt: '2026-06-10T09:30:00.000Z',
      sessions: [
        {
          id: 'SES-101',
          date: '2026-06-10',
          notes: 'جلسة واحدة تنظيف روتاري دوار وحشو عصب ثلاثي الأبعاد ممتاز',
          completed: true,
          affectedTeeth: [14],
          toothCondition: 'Root Canal'
        },
        {
          id: 'SES-102',
          date: '2026-06-25',
          notes: 'برد السن وتجربة القياس وتلبيس التاج الزيركون النهائي بنجاح تجميلي كامل',
          completed: true,
          affectedTeeth: [14],
          toothCondition: 'Crown'
        }
      ]
    }
  ],
  invoices: [
    {
      id: 'INV-2026-0001',
      patientId: 'PAT-829402',
      appointmentId: 'APP-1001',
      date: '2026-06-20',
      dueDate: '2026-06-27',
      items: [
        { id: 'ITM-01', description: 'جلسة تنظيف جير تجميلي تلميع', quantity: 1, unitPrice: 1000 },
        { id: 'ITM-02', description: 'حشوة تجميلية أولية', quantity: 1, unitPrice: 1000 }
      ],
      discount: 200,
      tax: 14,
      status: 'Paid',
      payments: [
        { id: 'PAY-2001', date: '2026-06-20', amount: 2052, method: 'Cash', notes: 'سداد نقدي في الاستقبال' }
      ],
      totalAmount: 2052,
      paidAmount: 2052,
      createdAt: '2026-06-20T16:00:00.000Z'
    },
    {
      id: 'INV-2026-0002',
      patientId: 'PAT-402941',
      treatmentPlanId: 'TRT-1002',
      date: '2026-06-25',
      dueDate: '2026-07-02',
      items: [
        { id: 'ITM-03', description: 'خطة علاج عصب الضرس 14 بالروتاري', quantity: 1, unitPrice: 3500 },
        { id: 'ITM-04', description: 'تاج زيركون ألماني تجميلي مسبق الصنع', quantity: 1, unitPrice: 3000 }
      ],
      discount: 500,
      tax: 0,
      status: 'Paid',
      payments: [
        { id: 'PAY-2002', date: '2026-06-25', amount: 6000, method: 'Card', notes: 'جهاز الدفع في العيادة' }
      ],
      totalAmount: 6000,
      paidAmount: 6000,
      createdAt: '2026-06-25T19:00:00.000Z'
    }
  ],
  expenses: [
    {
      id: 'EXP-1001',
      category: 'Supplies',
      description: 'شراء كبسولات أميلوجين وحشوات ضوئية تجميلية بيلاروسيا',
      amount: 1500,
      supplier: 'شركة مكة للمستلزمات',
      date: '2026-06-10',
      createdAt: '2026-06-10T14:00:00.000Z'
    },
    {
      id: 'EXP-1002',
      category: 'Rent',
      description: 'إيجار مقر عيادة برج فريدة ميت غمر لشهر يونيو',
      amount: 3000,
      supplier: 'الحاج فريد الجوهري',
      date: '2026-06-01',
      createdAt: '2026-06-01T09:00:00.000Z'
    },
    {
      id: 'EXP-1003',
      category: 'Utilities',
      description: 'فاتورة الكهرباء والإنترنت والتعقيم لشهر مايو',
      amount: 800,
      supplier: 'مرافق شرق الدقهلية',
      date: '2026-06-05',
      createdAt: '2026-06-05T11:00:00.000Z'
    }
  ],
  inventory: [
    {
      id: 'INV-SKU-001',
      name: 'مخدر موضعي أرتيكائين 4%',
      category: 'مستهلكات عيادة تخدير',
      sku: 'ART-4%-001',
      quantity: 120,
      supplier: 'الشركة المتحدة للمستلزمات الطبية',
      unitPrice: 15,
      minQuantity: 30,
      expirationDate: '2027-12-01',
      storageLocation: 'درج الحفظ أ-2',
      status: 'In Stock',
      createdAt: '2026-06-01T08:00:00.000Z'
    },
    {
      id: 'INV-SKU-002',
      name: 'شفرات حشو عصب روتاري 25مم',
      category: 'أدوات حشو عصب دورة',
      sku: 'ROT-FILE-25',
      quantity: 12,
      supplier: 'شركة دلتا لطب الأسنان',
      unitPrice: 85,
      minQuantity: 15,
      expirationDate: '2028-05-15',
      storageLocation: 'رف التعقيم ب-1',
      status: 'Low Stock',
      createdAt: '2026-06-02T10:15:00.000Z'
    },
    {
      id: 'INV-SKU-003',
      name: 'زرعات تيتانيوم ألمانية 4.5مم',
      category: 'مستلزمات زراعة دقيقة',
      sku: 'GER-IMP-4.5',
      quantity: 0,
      supplier: 'بريميم جيرمان دنت',
      unitPrice: 2200,
      minQuantity: 5,
      expirationDate: '2030-01-01',
      storageLocation: 'خزنة الزرعات المعقمة د-4',
      status: 'Out of Stock',
      createdAt: '2026-06-05T12:00:00.000Z'
    }
  ],
  notifications: [
    {
      id: 'NOT-001',
      type: 'Inventory',
      priority: 'High',
      title: 'نفاد مخزون الزرعات التيتانيوم',
      message: 'زرعات تيتانيوم ألمانية 4.5مم وصلت للصفر بالكامل في المخزن الرئيسي. يرجى إعادة الطلب.',
      read: false,
      createdAt: new Date(Date.now() - 3600 * 1000).toISOString()
    },
    {
      id: 'NOT-002',
      type: 'Appointments',
      priority: 'Medium',
      title: 'تأكيد حجز جديد مازن كمال',
      message: 'قام المريض مازن يوسف بحجز كشف استشارة جديد بتاريخ اليوم الساعة 14:00 مع د. عمرو العدوي.',
      read: false,
      createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      patientId: 'PAT-119402'
    }
  ]
};

// Seeding DB helper
async function seedDatabaseIfEmpty() {
  if (!prisma) return;

  try {
    // 1. Seed Settings
    const settingCount = await prisma.setting.count();
    if (settingCount === 0) {
      console.log("Seeding system settings...");
      await prisma.setting.createMany({
        data: [
          { key: "clinic_name", value: "DentalFlow Pro Clinic" },
          { key: "tax_rate", value: "14" },
          { key: "currency", value: "EGP" }
        ]
      });
    }

    // 2. Seed Users & Doctors
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      console.log("Seeding system users and doctors...");
      const seedSuperAdminPass = process.env.SEED_SUPER_ADMIN_PASSWORD || crypto.randomBytes(12).toString("hex");
      const seedAdminPass = process.env.SEED_ADMIN_PASSWORD || crypto.randomBytes(12).toString("hex");
      const seedDocPass = process.env.SEED_DOCTOR_PASSWORD || crypto.randomBytes(10).toString("hex");
      const seedRecepPass = process.env.SEED_RECEPTIONIST_PASSWORD || crypto.randomBytes(10).toString("hex");

      const adminHash = bcrypt.hashSync(seedAdminPass, 12);
      const superAdminHash = bcrypt.hashSync(seedSuperAdminPass, 12);
      const doctorHash = bcrypt.hashSync(seedDocPass, 12);
      const receptionistHash = bcrypt.hashSync(seedRecepPass, 12);

      const credentialsObj = {
        superAdmin: { email: "superadmin@clinic.com", password: seedSuperAdminPass },
        admin: { email: "admin@clinic.com", password: seedAdminPass },
        receptionist: { email: "receptionist@clinic.com", password: seedRecepPass },
        doctor: { defaultPassword: seedDocPass }
      };

      try {
        fs.writeFileSync("seed-credentials.json", JSON.stringify(credentialsObj, null, 2));
        console.log("=================================================");
        console.log("🔑 CLINIC SYSTEM SEED CREDENTIALS GENERATED:");
        console.log("👉 Saved securely to local 'seed-credentials.json'");
        console.log("=================================================");
      } catch (err) {
        console.error("Failed to write seed-credentials.json", err);
      }

      // Super Admin
      await prisma.user.create({
        data: {
          name: "Super Administrator",
          email: "superadmin@clinic.com",
          password: superAdminHash,
          role: UserRole.SUPER_ADMIN
        }
      });

      // Admin
      await prisma.user.create({
        data: {
          name: "Clinic Administrator",
          email: "admin@clinic.com",
          password: adminHash,
          role: UserRole.ADMIN
        }
      });

      // Receptionist
      await prisma.user.create({
        data: {
          name: "Clinic Receptionist",
          email: "receptionist@clinic.com",
          password: receptionistHash,
          role: UserRole.RECEPTIONIST
        }
      });

      // Doctors
      for (const doc of DEFAULT_SEEDS.doctors) {
        // Create User record for each doctor
        const docUser = await prisma.user.create({
          data: {
            name: doc.name,
            email: doc.email,
            password: doctorHash,
            role: UserRole.DOCTOR
          }
        });

        // Create Doctor record linked 1-to-1 to User
        await prisma.doctor.create({
          data: {
            id: doc.id,
            userId: docUser.id,
            specialty: doc.specialty,
            role: mapDoctorRoleToEnum(doc.role),
            image: doc.image || null
          }
        });
      }

      // Add additional doctor Amr El-Sherbiny from initial seeds if not included
      const hasSherbiny = DEFAULT_SEEDS.doctors.some((d: any) => d.email === "doctor@clinic.com");
      if (!hasSherbiny) {
        const docUser = await prisma.user.create({
          data: {
            name: "Dr. Amr El-Sherbiny",
            email: "doctor@clinic.com",
            password: doctorHash,
            role: UserRole.DOCTOR
          }
        });

        await prisma.doctor.create({
          data: {
            id: "doc-sherbiny",
            userId: docUser.id,
            specialty: "General Dentistry",
            role: DoctorRole.SPECIALIST,
            image: null
          }
        });
      }
    }

    // 3. Seed Suppliers
    const supplierCount = await prisma.supplier.count();
    const suppliersMap = new Map<string, string>();
    if (supplierCount === 0) {
      console.log("Seeding suppliers...");
      const rawSuppliers = new Set<string>();
      DEFAULT_SEEDS.expenses.forEach((e: any) => { if (e.supplier) rawSuppliers.add(e.supplier); });
      DEFAULT_SEEDS.inventory.forEach((i: any) => { if (i.supplier) rawSuppliers.add(i.supplier); });

      for (const name of rawSuppliers) {
        const s = await prisma.supplier.create({
          data: { name }
        });
        suppliersMap.set(name, s.id);
      }
    } else {
      const allSuppliers = await prisma.supplier.findMany();
      allSuppliers.forEach(s => suppliersMap.set(s.name, s.id));
    }

    // 4. Seed Patients (Centralized credentials)
    const patientCount = await prisma.patient.count();
    if (patientCount === 0) {
      console.log("Seeding patients to database...");
      for (const p of DEFAULT_SEEDS.patients) {
        let userId: string | null = null;
        if (p.email) {
          const patientPassword = crypto.randomBytes(8).toString("hex");
          const patientUser = await prisma.user.create({
            data: {
              name: p.name,
              email: p.email,
              password: bcrypt.hashSync(patientPassword, 12),
              role: UserRole.PATIENT
            }
          });
          userId = patientUser.id;
          console.log(`👉 Seeded Patient: ${p.name} (${p.email}) Default Password: ${patientPassword}`);
        }

        await prisma.patient.create({
          data: {
            id: p.id,
            userId,
            name: p.name,
            phone: p.phone,
            email: p.email || null,
            bloodType: p.bloodType || null,
            emergencyName: p.emergencyContact?.name || null,
            emergencyPhone: p.emergencyContact?.phone || null,
            emergencyRelation: p.emergencyContact?.relation || null,
            medicalConditions: p.medicalConditions || [],
            allergies: p.allergies || [],
            insuranceProvider: p.insurance?.provider || null,
            insurancePolicy: p.insurance?.policyNumber || null,
            insuranceDiscount: p.insurance?.discountPercent || 0,
            photoUrl: p.photoUrl || null,
            isActive: p.isActive !== undefined ? p.isActive : true,
            totalSpent: p.totalSpent || 0,
            outstandingBalance: p.outstandingBalance || 0,
            lastVisit: p.lastVisit ? new Date(p.lastVisit) : null,
          }
        });
      }
    }

    // 5. Seed Appointments
    const appointmentCount = await prisma.appointment.count();
    if (appointmentCount === 0) {
      console.log("Seeding appointments to database...");
      for (const app of DEFAULT_SEEDS.appointments) {
        // Look up doctor user, then find the doctor record
        const docUser = await prisma.user.findFirst({ where: { email: app.doctorEmail } });
        let docRecord = docUser ? await prisma.doctor.findFirst({ where: { userId: docUser.id } }) : null;
        const finalDoctorId = docRecord ? docRecord.id : 'doc-amr';

        await prisma.appointment.create({
          data: {
            id: app.id,
            patientId: app.patientId,
            doctorId: finalDoctorId,
            date: new Date(app.date),
            time: app.time,
            duration: app.duration,
            visitType: mapVisitTypeToEnum(app.visitType || "Consultation"),
            chairId: app.chairId,
            consultationFee: app.consultationFee,
            paymentMethod: mapPaymentMethodToEnum(app.paymentMethod || "Cash"),
            status: mapAppointmentStatusToEnum(app.status || "Scheduled"),
            notes: app.notes || null,
          }
        });
      }
    }

    // 6. Seed Treatments & sessions
    const treatmentCount = await prisma.treatment.count();
    if (treatmentCount === 0) {
      console.log("Seeding treatments to database...");
      for (const t of DEFAULT_SEEDS.treatments) {
        await prisma.treatment.create({
          data: {
            id: t.id,
            patientId: t.patientId,
            title: t.title,
            description: t.description || null,
            status: mapTreatmentStatusToEnum(t.status || "In Progress"),
            totalCost: t.totalCost,
            paidAmount: t.paidAmount,
            sessions: {
              create: (t.sessions || []).map((s: any) => ({
                id: s.id,
                date: new Date(s.date),
                notes: s.notes || null,
                completed: s.completed,
                affectedTeeth: s.affectedTeeth || [],
                toothCondition: s.toothCondition ? mapToothConditionToEnum(s.toothCondition) : null
              }))
            }
          }
        });
      }
    }

    // 7. Seed Invoices & payments
    const invoiceCount = await prisma.invoice.count();
    if (invoiceCount === 0) {
      console.log("Seeding invoices to database...");
      for (const inv of DEFAULT_SEEDS.invoices) {
        await prisma.invoice.create({
          data: {
            id: inv.id,
            patientId: inv.patientId,
            appointmentId: inv.appointmentId || null,
            treatmentPlanId: inv.treatmentPlanId || null,
            date: new Date(inv.date),
            dueDate: new Date(inv.dueDate),
            discount: inv.discount || 0,
            tax: inv.tax || 0,
            status: mapInvoiceStatusToEnum(inv.status || "Unpaid"),
            totalAmount: inv.totalAmount,
            paidAmount: inv.paidAmount,
            items: {
              create: (inv.items || []).map((it: any) => ({
                id: it.id,
                description: it.description,
                quantity: it.quantity,
                unitPrice: it.unitPrice
              }))
            },
            payments: {
              create: (inv.payments || []).map((p: any) => ({
                id: p.id,
                date: new Date(p.date),
                amount: p.amount,
                method: mapPaymentMethodToEnum(p.method || "Cash"),
                notes: p.notes || null
              }))
            }
          }
        });
      }
    }

    // 8. Seed Expenses
    const expenseCount = await prisma.expense.count();
    if (expenseCount === 0) {
      console.log("Seeding expenses to database...");
      for (const exp of DEFAULT_SEEDS.expenses) {
        await prisma.expense.create({
          data: {
            id: exp.id,
            category: exp.category,
            description: exp.description || null,
            amount: exp.amount,
            supplierId: exp.supplier ? suppliersMap.get(exp.supplier) || null : null,
            date: new Date(exp.date),
          }
        });
      }
    }

    // 9. Seed Inventory
    const inventoryCount = await prisma.inventory.count();
    if (inventoryCount === 0) {
      console.log("Seeding inventory to database...");
      for (const item of DEFAULT_SEEDS.inventory) {
        await prisma.inventory.create({
          data: {
            id: item.id,
            name: item.name,
            category: item.category,
            sku: item.sku || null,
            quantity: item.quantity,
            supplierId: item.supplier ? suppliersMap.get(item.supplier) || null : null,
            unitPrice: item.unitPrice,
            minQuantity: item.minQuantity,
            expirationDate: item.expirationDate ? new Date(item.expirationDate) : null,
            storageLocation: item.storageLocation || null,
            status: mapInventoryStatusToEnum(item.status || "In Stock"),
          }
        });
      }
    }

    // 10. Seed Notifications
    const notificationCount = await prisma.notification.count();
    if (notificationCount === 0) {
      console.log("Seeding notifications to database...");
      for (const n of DEFAULT_SEEDS.notifications) {
        await prisma.notification.create({
          data: {
            id: n.id,
            type: mapNotificationTypeToEnum(n.type),
            priority: mapNotificationPriorityToEnum(n.priority),
            title: n.title,
            message: n.message,
            read: n.read,
            patientId: n.patientId || null,
            actionUrl: n.actionUrl || null,
            createdAt: new Date(n.createdAt)
          }
        });
      }
    }

    // 11. Seed default Revenue Share Rules
    const ruleCount = await prisma.revenueShareRule.count();
    if (ruleCount === 0) {
      console.log("Seeding default revenue share rules...");
      const doctors = await prisma.doctor.findMany({
        include: { user: true }
      });
      const amr = doctors.find(d => d.user.email === "amr.eladawy@gmail.com");
      const basel = doctors.find(d => d.user.email === "basel.elmorsy@gmail.com");

      if (amr) {
        await prisma.revenueShareRule.create({
          data: {
            id: crypto.randomUUID(),
            doctorId: amr.id,
            partnerSharePct: 35.00,
            selfSharePct: 65.00,
            effectiveFrom: new Date("2020-01-01"),
            effectiveTo: null
          }
        });
      }
      if (basel) {
        await prisma.revenueShareRule.create({
          data: {
            id: crypto.randomUUID(),
            doctorId: basel.id,
            partnerSharePct: 35.00,
            selfSharePct: 65.00,
            effectiveFrom: new Date("2020-01-01"),
            effectiveTo: null
          }
        });
      }
    }

    console.log("Prisma Seeding Check Complete with 3NF Norm!");
  } catch (err) {
    console.error("Prisma seeding error:", err);
  }
}

// Ensure local JSON DB file fallback exists
function initLocalJsonDb() {
  if (!fs.existsSync(LOCAL_DB_PATH)) {
    console.log("Creating new db.json with seed data.");
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(DEFAULT_SEEDS, null, 2), "utf8");
  }
}

// Global cached database to prevent blocking disk reads on every request
let localDbCache: Record<string, any> | null = null;
let localDbWritePromise: Promise<any> = Promise.resolve();

// Fallback Helper for local json reads (uses cache, non-blocking after first boot read)
function readLocalJsonDb(): Record<string, any> {
  initLocalJsonDb();
  if (localDbCache) {
    return localDbCache;
  }
  try {
    const content = fs.readFileSync(LOCAL_DB_PATH, "utf8");
    localDbCache = JSON.parse(content);
    return localDbCache!;
  } catch (err) {
    console.error("Failed to read local JSON DB fallback:", err);
    return DEFAULT_SEEDS;
  }
}

// Fallback Helper for local json saves (async, non-blocking background queue, updates memory cache instantly)
function writeLocalJsonDb(key: string, data: any) {
  const current = readLocalJsonDb();
  current[key] = data;
  localDbCache = current; // instant in-memory sync

  // Serialize the file writes sequentially in background without blocking Node's event loop
  localDbWritePromise = localDbWritePromise.then(async () => {
    try {
      await fs.promises.writeFile(LOCAL_DB_PATH, JSON.stringify(current, null, 2), "utf8");
    } catch (err) {
      console.error(`Failed to save key ${key} to local JSON DB fallback:`, err);
    }
  });
}

// ==========================================
// RESOURCE-BASED PRISMA / FALLBACK API ROUTES
// ==========================================

// 1. Doctors Endpoint
app.get("/api/doctors", authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN", "DOCTOR", "RECEPTIONIST", "PATIENT"]), async (req, res) => {
  try {
    const cached = getCached("doctors");
    if (cached) {
      return res.json(cached);
    }
    if (prisma) {
      const doctors = await prisma.doctor.findMany({
        include: { user: true }
      });
      const formatted = doctors.map(d => ({
        id: d.id,
        name: d.user.name,
        email: d.user.email,
        specialty: d.specialty,
        role: mapDoctorRoleToDisplay(d.role),
        image: d.image || ""
      }));
      setCached("doctors", formatted, 10 * 60 * 1000); // 10 min TTL
      return res.json(formatted);
    } else {
      const local = readLocalJsonDb();
      const formatted = local.doctors || [];
      setCached("doctors", formatted, 10 * 60 * 1000);
      return res.json(formatted);
    }
  } catch (err) {
    console.error("Get doctors failed:", err);
    return res.status(500).json({ error: "Failed to get doctors" });
  }
});

app.post("/api/doctors", authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN", "DOCTOR"]), async (req: AuthenticatedRequest, res) => {
  const validation = z.array(DoctorSchema).safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: "Invalid request payload", details: validation.error.issues });
  }
  const doctors = validation.data;
  try {
    if (req.user?.role === "DOCTOR") {
      if (prisma) {
        const callerDoctor = await prisma.doctor.findFirst({
          where: {
            OR: [
              { userId: req.user.id },
              { user: { email: req.user.email } }
            ]
          }
        });
        if (!callerDoctor) {
          return res.status(403).json({ error: "No doctor profile associated with your account." });
        }
        const unauthorized = doctors.some(d => d.id !== callerDoctor.id);
        if (unauthorized) {
          return res.status(403).json({ error: "You are only authorized to edit your own doctor profile." });
        }
      } else {
        const local = readLocalJsonDb();
        const localDocs = local.doctors || [];
        const callerDoctor = localDocs.find((d: any) => d.email === req.user?.email || d.id === req.user?.id);
        if (!callerDoctor) {
          return res.status(403).json({ error: "No doctor profile associated with your account." });
        }
        const unauthorized = doctors.some((d: any) => d.id !== callerDoctor.id);
        if (unauthorized) {
          return res.status(403).json({ error: "You are only authorized to edit your own doctor profile." });
        }
      }
    }

    if (prisma) {
      await prisma.$transaction(async (tx) => {
        for (const d of doctors) {
          // Find or create associated User record
          let user = await tx.user.findUnique({ where: { email: d.email } });
          if (!user) {
            const existingDoc = await tx.doctor.findUnique({
              where: { id: d.id },
              include: { user: true }
            });
            if (existingDoc && existingDoc.user) {
              user = existingDoc.user;
            }
          }

          if (user) {
            user = await tx.user.update({
              where: { id: user.id },
              data: {
                name: d.name,
                email: d.email,
                role: UserRole.DOCTOR
              }
            });
          } else {
            const doctorHash = bcrypt.hashSync(crypto.randomBytes(16).toString("hex"), 12);
            user = await tx.user.create({
              data: {
                name: d.name,
                email: d.email,
                password: doctorHash,
                role: UserRole.DOCTOR,
                isVerified: true
              }
            });
          }

          await tx.doctor.upsert({
            where: { id: d.id },
            update: {
              userId: user.id,
              specialty: d.specialty,
              role: mapDoctorRoleToEnum(d.role),
              image: d.image || null,
            },
            create: {
              id: d.id,
              userId: user.id,
              specialty: d.specialty,
              role: mapDoctorRoleToEnum(d.role),
              image: d.image || null,
            }
          });
        }
      });
      invalidateCache("doctors");
      await createAuditLog("UPDATE_RECORD", "SUCCESS", req.user?.id || null, req.user?.email || null, req, `Bulk upserted ${doctors.length} doctors`);
      return res.json({ success: true });
    } else {
      writeLocalJsonDb("doctors", doctors);
      invalidateCache("doctors");
      await createAuditLog("UPDATE_RECORD", "SUCCESS", req.user?.id || null, req.user?.email || null, req, `Bulk upserted ${doctors.length} doctors (local fallback)`);
      return res.json({ success: true });
    }
  } catch (err) {
    console.error("Post doctors failed:", err);
    return res.status(500).json({ error: "Failed to update doctors" });
  }
});

// 2. Patients Endpoint
app.get("/api/patients", authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN", "DOCTOR", "RECEPTIONIST", "PATIENT"]), async (req: AuthenticatedRequest, res) => {
  try {
    if (prisma) {
      let patientIdFilter: string | null = null;
      if (req.user?.role === "PATIENT") {
        const patient = await prisma.patient.findFirst({
          where: { OR: [{ id: req.user.id }, { userId: req.user.id }] }
        });
        patientIdFilter = patient ? patient.id : req.user.id;
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;

      const dbPatients = await prisma.patient.findMany({
        where: patientIdFilter ? { id: patientIdFilter } : undefined,
        orderBy: { createdAt: "desc" },
        include: { user: true },
        take: limit && !isNaN(limit) ? limit : undefined,
        skip: offset && !isNaN(offset) ? offset : undefined,
      });
      // Map back to client-friendly format
      const mapped = dbPatients.map(p => ({
        id: p.id,
        name: p.name,
        phone: p.phone,
        email: p.email || p.user?.email || undefined,
        password: p.user?.password ? "seeded_hash" : undefined,
        bloodType: p.bloodType || undefined,
        emergencyContact: {
          name: p.emergencyName || "",
          phone: p.emergencyPhone || "",
          relation: p.emergencyRelation || ""
        },
        medicalConditions: p.medicalConditions,
        allergies: p.allergies,
        insurance: {
          provider: p.insuranceProvider || "",
          policyNumber: p.insurancePolicy || "",
          discountPercent: Number(p.insuranceDiscount || 0)
        },
        photoUrl: p.photoUrl || undefined,
        isActive: p.isActive,
        totalSpent: Number(p.totalSpent || 0),
        outstandingBalance: Number(p.outstandingBalance || 0),
        lastVisit: p.lastVisit ? p.lastVisit.toISOString().slice(0, 10) : undefined,
        createdAt: p.createdAt.toISOString()
      }));
      return res.json(mapped);
    } else {
      const local = readLocalJsonDb();
      return res.json(local.patients || []);
    }
  } catch (err) {
    console.error("Get patients failed:", err);
    return res.status(500).json({ error: "Failed to get patients" });
  }
});

app.post("/api/patients", largeJsonParser, authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN", "DOCTOR", "RECEPTIONIST"]), async (req: AuthenticatedRequest, res) => {
  const validation = z.array(PatientSchema).safeParse(req.body);
  if (!validation.success) {
    const errText = `Validation failed: ${JSON.stringify(validation.error.issues, null, 2)}`;
    console.error(errText);
    return res.status(400).json({ error: "Invalid request payload", details: validation.error.issues });
  }
  const patients = validation.data;
  try {
    if (prisma) {
      const seenEmails = new Set<string>();
      const parseSafeDate = (val: any) => {
        if (!val) return null;
        const d = new Date(val);
        return isNaN(d.getTime()) ? null : d;
      };

      // Load all existing patients and map them to optimize performance and prevent N+1 loop overhead (Critical Finding 4.1, 4.2)
      const existingPatients = await prisma.patient.findMany({
        include: { user: true }
      });
      const existingMap = new Map(existingPatients.map(pat => [pat.id, pat]));

      for (const p of patients) {
        const existing = existingMap.get(p.id);
        let isChanged = !existing;
        if (existing) {
          let patientEmail = p.email;
          if (patientEmail === "patient@dentalflow.pro") {
            patientEmail = null;
          }
          const currentEmail = existing.email || existing.user?.email || null;
          const currentRelation = existing.emergencyRelation || "";
          const pRelation = p.emergencyContact?.relation || "";
          const currentDiscount = Number(existing.insuranceDiscount || 0);
          const pDiscount = Number(p.insurance?.discountPercent || 0);

          if (
            existing.name !== p.name ||
            existing.phone !== p.phone ||
            currentEmail !== patientEmail ||
            (existing.bloodType || "") !== (p.bloodType || "") ||
            (existing.emergencyName || "") !== (p.emergencyContact?.name || "") ||
            (existing.emergencyPhone || "") !== (p.emergencyContact?.phone || "") ||
            currentRelation !== pRelation ||
            JSON.stringify(existing.medicalConditions || []) !== JSON.stringify(p.medicalConditions || []) ||
            JSON.stringify(existing.allergies || []) !== JSON.stringify(p.allergies || []) ||
            (existing.insuranceProvider || "") !== (p.insurance?.provider || "") ||
            (existing.insurancePolicy || "") !== (p.insurance?.policyNumber || "") ||
            currentDiscount !== pDiscount ||
            (existing.photoUrl || "") !== (p.photoUrl || "") ||
            existing.isActive !== p.isActive
          ) {
            isChanged = true;
          }
        }

        if (!isChanged) {
          continue; // Performance sync diff skip! Skip database write & balance recalculation.
        }

        let userId: string | null = null;
        let patientEmail = p.email;
        if (patientEmail === "patient@dentalflow.pro") {
          patientEmail = null;
        }

        if (patientEmail) {
          if (seenEmails.has(patientEmail)) {
            patientEmail = null;
          } else {
            // Check if this email is already registered to another patient
            const anotherPatientWithEmail = await prisma.patient.findFirst({
              where: {
                email: patientEmail,
                NOT: { id: p.id }
              }
            });
            if (anotherPatientWithEmail) {
              patientEmail = null;
            } else {
              seenEmails.add(patientEmail);
            }
          }
        }

        if (patientEmail) {
          // Find or create associated User record
          let patientUser = await prisma.user.findUnique({ where: { email: patientEmail } });
          if (patientUser) {
            const linkedPatient = await prisma.patient.findUnique({ where: { userId: patientUser.id } });
            if (linkedPatient && linkedPatient.id !== p.id) {
              // Already linked to a different patient, cannot reuse
              patientEmail = null;
            }
          }

          if (patientEmail) {
            if (!patientUser) {
              const existingPatient = await prisma.patient.findUnique({
                where: { id: p.id },
                include: { user: true }
              });
              if (existingPatient && existingPatient.user) {
                patientUser = existingPatient.user;
              }
            }

            if (patientUser) {
              patientUser = await prisma.user.update({
                where: { id: patientUser.id },
                data: {
                  name: p.name,
                  email: patientEmail,
                  role: UserRole.PATIENT
                }
              });
            } else {
              const patientHash = bcrypt.hashSync(p.password || crypto.randomBytes(16).toString("hex"), 12);
              patientUser = await prisma.user.create({
                data: {
                  name: p.name,
                  email: patientEmail,
                  password: patientHash,
                  role: UserRole.PATIENT,
                  isVerified: true
                }
              });
            }
            userId = patientUser.id;
          }
        }

        const safeIsActive = p.isActive === true || p.isActive === false ? p.isActive : true;

        await prisma.patient.upsert({
          where: { id: p.id },
          update: {
            userId,
            name: p.name,
            phone: p.phone,
            email: patientEmail || null,
            bloodType: p.bloodType || null,
            emergencyName: p.emergencyContact?.name || null,
            emergencyPhone: p.emergencyContact?.phone || null,
            emergencyRelation: p.emergencyContact?.relation || null,
            medicalConditions: p.medicalConditions || [],
            allergies: p.allergies || [],
            insuranceProvider: p.insurance?.provider || null,
            insurancePolicy: p.insurance?.policyNumber || null,
            insuranceDiscount: Number(p.insurance?.discountPercent) || 0,
            photoUrl: p.photoUrl || null,
            isActive: safeIsActive,
            totalSpent: Number(p.totalSpent) || 0,
            outstandingBalance: Number(p.outstandingBalance) || 0,
            lastVisit: parseSafeDate(p.lastVisit),
          },
          create: {
            id: p.id,
            userId,
            name: p.name,
            phone: p.phone,
            email: patientEmail || null,
            bloodType: p.bloodType || null,
            emergencyName: p.emergencyContact?.name || null,
            emergencyPhone: p.emergencyContact?.phone || null,
            emergencyRelation: p.emergencyContact?.relation || null,
            medicalConditions: p.medicalConditions || [],
            allergies: p.allergies || [],
            insuranceProvider: p.insurance?.provider || null,
            insurancePolicy: p.insurance?.policyNumber || null,
            insuranceDiscount: Number(p.insurance?.discountPercent) || 0,
            photoUrl: p.photoUrl || null,
            isActive: safeIsActive,
            totalSpent: Number(p.totalSpent) || 0,
            outstandingBalance: Number(p.outstandingBalance) || 0,
            lastVisit: parseSafeDate(p.lastVisit),
          }
        });

        // Perform automatic server-side recalculation of outstanding balance and spending (H-2)
        await recalculatePatientBalanceServer(p.id, prisma);
      }

      await createAuditLog("UPDATE_RECORD", "SUCCESS", req.user?.id || null, req.user?.email || null, req, `Bulk upserted ${patients.length} patients`);
      return res.json({ success: true });
    } else {
      writeLocalJsonDb("patients", patients);
      await createAuditLog("UPDATE_RECORD", "SUCCESS", req.user?.id || null, req.user?.email || null, req, `Bulk upserted ${patients.length} patients (local fallback)`);
      return res.json({ success: true });
    }
  } catch (err: any) {
    const errText = `Post patients failed: ${err.message}\nStack: ${err.stack}`;
    console.error(errText);
    fs.writeFileSync("patients_error.log", errText);
    return res.status(500).json({ error: "Failed to update patients" });
  }
});

// 3. Appointments Endpoint
app.get("/api/appointments", authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN", "DOCTOR", "RECEPTIONIST", "PATIENT"]), async (req: AuthenticatedRequest, res) => {
  try {
    if (prisma) {
      let patientIdFilter: string | null = null;
      if (req.user?.role === "PATIENT") {
        const patient = await prisma.patient.findFirst({
          where: { OR: [{ id: req.user.id }, { userId: req.user.id }] }
        });
        patientIdFilter = patient ? patient.id : req.user.id;
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;

      const dbAppts = await prisma.appointment.findMany({
        where: patientIdFilter ? { patientId: patientIdFilter } : undefined,
        include: {
          patient: true,
          doctor: {
            include: { user: true }
          }
        },
        take: limit && !isNaN(limit) ? limit : undefined,
        skip: offset && !isNaN(offset) ? offset : undefined,
      });
      const mapped = dbAppts.map(a => ({
        id: a.id,
        patientId: a.patientId,
        patientName: a.patient.name,
        patientPhone: a.patient.phone,
        doctorEmail: a.doctor.user.email,
        doctorName: a.doctor.user.name,
        date: a.date.toISOString().slice(0, 10),
        time: a.time,
        duration: a.duration,
        visitType: mapVisitTypeToDisplay(a.visitType),
        chairId: a.chairId,
        consultationFee: Number(a.consultationFee || 0),
        paymentMethod: mapPaymentMethodToDisplay(a.paymentMethod),
        status: mapAppointmentStatusToDisplay(a.status),
        notes: a.notes || "",
        isOnline: a.isOnline || (a.notes ? (a.notes.includes("الموقع الإلكتروني") || a.notes.includes("أونلاين")) : false),
        createdAt: a.createdAt.toISOString()
      }));
      return res.json(mapped);
    } else {
      const local = readLocalJsonDb();
      return res.json(local.appointments || []);
    }
  } catch (err) {
    console.error("Get appointments failed:", err);
    return res.status(500).json({ error: "Failed to get appointments" });
  }
});

app.post("/api/appointments", authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN", "DOCTOR", "RECEPTIONIST"]), async (req: AuthenticatedRequest, res) => {
  const validation = z.array(AppointmentSchema).safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: "Invalid request payload", details: validation.error.issues });
  }
  const appointments = validation.data;
  try {
    const lockedMonths = await getLockedMonthsList();
    const postedIds = appointments.map(app => app.id);

    if (prisma) {
      const existingAppts = await prisma.appointment.findMany();
      const affectedAppts = existingAppts.filter(app => {
        const isBeingDeleted = !postedIds.includes(app.id);
        const isBeingModified = postedIds.includes(app.id);
        return isBeingDeleted || isBeingModified;
      });
      const hasLockedAffected = affectedAppts.some(app => {
        const month = app.date.toISOString().slice(0, 7);
        return lockedMonths.includes(month);
      });
      const hasLockedNew = appointments.some(app => {
        const month = app.date.slice(0, 7);
        return lockedMonths.includes(month) && !existingAppts.some(e => e.id === app.id);
      });
      if (hasLockedAffected || hasLockedNew) {
        return res.status(403).json({ error: "Cannot modify or delete appointments in locked months." });
      }
    } else {
      const local = readLocalJsonDb();
      const existingAppts = local.appointments || [];
      const affectedAppts = existingAppts.filter((app: any) => {
        const isBeingDeleted = !postedIds.includes(app.id);
        const isBeingModified = postedIds.includes(app.id);
        return isBeingDeleted || isBeingModified;
      });
      const hasLockedAffected = affectedAppts.some((app: any) => {
        const month = app.date.slice(0, 7);
        return lockedMonths.includes(month);
      });
      const hasLockedNew = appointments.some(app => {
        const month = app.date.slice(0, 7);
        return lockedMonths.includes(month) && !existingAppts.some((e: any) => e.id === app.id);
      });
      if (hasLockedAffected || hasLockedNew) {
        return res.status(403).json({ error: "Cannot modify or delete appointments in locked months." });
      }
    }

    if (prisma) {
      const existingAppts = await prisma.appointment.findMany({
        include: { doctor: { include: { user: true } } }
      });
      const existingMap = new Map(existingAppts.map(app => [app.id, app]));

      const result = await prisma.$transaction(async (tx) => {
        for (const a of appointments) {
          const existing = existingMap.get(a.id);
          let isChanged = !existing;
          if (existing) {
            const extDateStr = existing.date.toISOString().slice(0, 10);
            const aDateStr = a.date.slice(0, 10);
            const extDocEmail = existing.doctor?.user?.email || "";
            if (
              existing.patientId !== a.patientId ||
              extDocEmail !== a.doctorEmail ||
              extDateStr !== aDateStr ||
              existing.time !== a.time ||
              (existing.duration || 30) !== (a.duration || 30) ||
              mapVisitTypeToEnum(existing.visitType) !== mapVisitTypeToEnum(a.visitType || "Consultation") ||
              existing.chairId !== (a.chairId || "Chair 1") ||
              Number(existing.consultationFee || 0) !== Number(a.consultationFee || 0) ||
              mapPaymentMethodToEnum(existing.paymentMethod) !== mapPaymentMethodToEnum(a.paymentMethod || "Cash") ||
              mapAppointmentStatusToEnum(existing.status) !== mapAppointmentStatusToEnum(a.status || "Scheduled") ||
              (existing.notes || "") !== (a.notes || "") ||
              existing.isOnline !== (a.isOnline || false)
            ) {
              isChanged = true;
            }
          }

          if (!isChanged) {
            continue; // Skip unchanged appointments to save database transaction overhead (Critical Finding 4.1, 4.2)
          }

          // Check if patient is active/inactive (H-2.2)
          const patRecord = await tx.patient.findUnique({
            where: { id: a.patientId }
          });
          if (patRecord && !patRecord.isActive) {
            throw new Error(`Conflict: المريض ${patRecord.name} غير نشط حالياً ولا يمكن جدولة مواعيد له. This patient is inactive.`);
          }

          // Find or create associated doctor first under 3NF
          let docUser = await tx.user.findFirst({
            where: { email: a.doctorEmail }
          });
          let doctor = docUser ? await tx.doctor.findFirst({
            where: { userId: docUser.id }
          }) : null;

          if (!doctor) {
            if (!docUser) {
              docUser = await tx.user.create({
                data: {
                  name: a.doctorName || "Dr. Assigned Assistant",
                  email: a.doctorEmail || `assigned-${Math.random()}@clinic.com`,
                  password: bcrypt.hashSync(crypto.randomBytes(16).toString("hex"), 12),
                  role: UserRole.DOCTOR,
                  isVerified: true
                }
              });
            }
            doctor = await tx.doctor.create({
              data: {
                userId: docUser.id,
                specialty: "Dental Specialist",
                role: DoctorRole.SPECIALIST
              }
            });
          }

          // Double-booking check: verify if there is an existing non-canceled appointment for this doctor at this date/time (excluding the current one)
          const duplicate = await tx.appointment.findFirst({
            where: {
              doctorId: doctor.id,
              date: new Date(a.date),
              time: a.time,
              id: { not: a.id },
              status: { not: AppointmentStatus.CANCELED }
            }
          });
          if (duplicate) {
            throw new Error(`Conflict: الموعد ${a.time} يوم ${a.date.slice(0, 10)} محجوز بالفعل للطبيب المختار.`);
          }

          await tx.appointment.upsert({
            where: { id: a.id },
            update: {
              patientId: a.patientId,
              doctorId: doctor.id,
              date: new Date(a.date),
              time: a.time,
              duration: a.duration || 30,
              visitType: mapVisitTypeToEnum(a.visitType || "Consultation"),
              chairId: a.chairId || "Chair 1",
              consultationFee: a.consultationFee || 0,
              paymentMethod: mapPaymentMethodToEnum(a.paymentMethod || "Cash"),
              status: mapAppointmentStatusToEnum(a.status || "Scheduled"),
              notes: a.notes || null,
              isOnline: a.isOnline || false,
            },
            create: {
              id: a.id,
              patientId: a.patientId,
              doctorId: doctor.id,
              date: new Date(a.date),
              time: a.time,
              duration: a.duration || 30,
              visitType: mapVisitTypeToEnum(a.visitType || "Consultation"),
              chairId: a.chairId || "Chair 1",
              consultationFee: a.consultationFee || 0,
              paymentMethod: mapPaymentMethodToEnum(a.paymentMethod || "Cash"),
              status: mapAppointmentStatusToEnum(a.status || "Scheduled"),
              notes: a.notes || null,
              isOnline: a.isOnline || false,
            }
          });

          // Perform automatic server-side recalculation of outstanding balance and spending (H-2)
          await recalculatePatientBalanceServer(a.patientId, tx);
        }
        return { success: true };
      }, {
        isolationLevel: "Serializable",
        maxWait: 15000,
        timeout: 60000
      });

      await createAuditLog("UPDATE_RECORD", "SUCCESS", req.user?.id || null, req.user?.email || null, req, `Bulk upserted ${appointments.length} appointments`);
      return res.json({ success: true });
    } else {
      writeLocalJsonDb("appointments", appointments);
      await createAuditLog("UPDATE_RECORD", "SUCCESS", req.user?.id || null, req.user?.email || null, req, `Bulk upserted ${appointments.length} appointments (local fallback)`);
      return res.json({ success: true });
    }
  } catch (err: any) {
    console.error("Post appointments failed:", err);
    if (err.message && err.message.startsWith("Conflict:")) {
      return res.status(409).json({ error: err.message.replace("Conflict: ", "") });
    }
    return res.status(500).json({ error: "Failed to update appointments" });
  }
});

// 4. Treatments Endpoint
app.get("/api/treatments", authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN", "DOCTOR", "RECEPTIONIST", "PATIENT"]), async (req: AuthenticatedRequest, res) => {
  try {
    if (prisma) {
      let patientIdFilter: string | null = null;
      if (req.user?.role === "PATIENT") {
        const patient = await prisma.patient.findFirst({
          where: { OR: [{ id: req.user.id }, { userId: req.user.id }] }
        });
        patientIdFilter = patient ? patient.id : req.user.id;
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;

      const dbTreatments = await prisma.treatment.findMany({
        where: patientIdFilter ? { patientId: patientIdFilter } : undefined,
        include: { sessions: true },
        take: limit && !isNaN(limit) ? limit : undefined,
        skip: offset && !isNaN(offset) ? offset : undefined,
      });
      const mapped = dbTreatments.map(t => ({
        id: t.id,
        patientId: t.patientId,
        doctorId: t.doctorId || undefined,
        title: t.title,
        description: t.description || "",
        status: mapTreatmentStatusToDisplay(t.status),
        totalCost: Number(t.totalCost || 0),
        paidAmount: Number(t.paidAmount || 0),
        createdAt: t.createdAt.toISOString(),
        sessions: (t.sessions || []).map((s: any) => ({
          id: s.id,
          date: s.date.toISOString().slice(0, 10),
          notes: s.notes || "",
          completed: s.completed,
          affectedTeeth: s.affectedTeeth || [],
          toothCondition: s.toothCondition ? mapToothConditionToDisplay(s.toothCondition) : ""
        }))
      }));
      return res.json(mapped);
    } else {
      const local = readLocalJsonDb();
      return res.json(local.treatments || []);
    }
  } catch (err) {
    console.error("Get treatments failed:", err);
    return res.status(500).json({ error: "Failed to get treatments" });
  }
});

app.post("/api/treatments", authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN", "DOCTOR", "RECEPTIONIST"]), async (req: AuthenticatedRequest, res) => {
  const validation = z.array(TreatmentSchema).safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: "Invalid request payload", details: validation.error.issues });
  }
  const treatments = validation.data;
  try {
    if (prisma) {
      const existingTreatments = await prisma.treatment.findMany({
        include: { sessions: true }
      });
      const existingMap = new Map(existingTreatments.map(t => [t.id, t]));

      const result = await prisma.$transaction(async (tx) => {
        for (const t of treatments) {
          const existing = existingMap.get(t.id);
          let isChanged = !existing;
          if (existing) {
            const extStatus = mapTreatmentStatusToEnum(existing.status);
            const aStatus = mapTreatmentStatusToEnum(t.status);
            if (
              existing.patientId !== t.patientId ||
              existing.doctorId !== (t.doctorId || null) ||
              existing.title !== t.title ||
              (existing.description || "") !== (t.description || "") ||
              extStatus !== aStatus ||
              Number(existing.totalCost) !== Number(t.totalCost || 0) ||
              Number(existing.paidAmount) !== Number(t.paidAmount || 0)
            ) {
              isChanged = true;
            } else {
              const extSessions = existing.sessions || [];
              const tSessions = t.sessions || [];
              if (extSessions.length !== tSessions.length) {
                isChanged = true;
              } else {
                for (let i = 0; i < extSessions.length; i++) {
                  const sExt = extSessions[i];
                  const sIn = tSessions[i];
                  const sExtDateStr = sExt.date.toISOString().slice(0, 10);
                  const sInDateStr = sIn.date.slice(0, 10);
                  const sExtCondition = sExt.toothCondition ? mapToothConditionToEnum(sExt.toothCondition) : null;
                  const sInCondition = sIn.toothCondition ? mapToothConditionToEnum(sIn.toothCondition) : null;
                  if (
                    sExtDateStr !== sInDateStr ||
                    (sExt.notes || "") !== (sIn.notes || "") ||
                    sExt.completed !== sIn.completed ||
                    JSON.stringify(sExt.affectedTeeth || []) !== JSON.stringify(sIn.affectedTeeth || []) ||
                    sExtCondition !== sInCondition
                  ) {
                    isChanged = true;
                    break;
                  }
                }
              }
            }
          }

          if (!isChanged) {
            continue; // Skip unchanged treatments to save database transaction overhead (Critical Finding 4.1, 4.2)
          }

          await tx.treatment.upsert({
            where: { id: t.id },
            update: {
              patientId: t.patientId,
              doctorId: t.doctorId || null,
              title: t.title,
              description: t.description || null,
              status: mapTreatmentStatusToEnum(t.status),
              totalCost: t.totalCost || 0,
              paidAmount: t.paidAmount || 0,
            },
            create: {
              id: t.id,
              patientId: t.patientId,
              doctorId: t.doctorId || null,
              title: t.title,
              description: t.description || null,
              status: mapTreatmentStatusToEnum(t.status),
              totalCost: t.totalCost || 0,
              paidAmount: t.paidAmount || 0,
            }
          });

          // Sync associated sessions cleanly within transaction
          await tx.treatmentSession.deleteMany({
            where: { treatmentId: t.id }
          });

          if (t.sessions && t.sessions.length > 0) {
            await tx.treatmentSession.createMany({
              data: t.sessions.map((s: any) => ({
                id: s.id,
                treatmentId: t.id,
                date: new Date(s.date),
                notes: s.notes || null,
                completed: s.completed,
                affectedTeeth: s.affectedTeeth || [],
                toothCondition: s.toothCondition ? mapToothConditionToEnum(s.toothCondition) : null
              }))
            });
          }

          // Perform automatic server-side recalculation of outstanding balance and spending (H-2)
          await recalculatePatientBalanceServer(t.patientId, tx);
        }
        return { success: true };
      });

      await createAuditLog("UPDATE_RECORD", "SUCCESS", req.user?.id || null, req.user?.email || null, req, `Bulk upserted ${treatments.length} treatments`);
      return res.json({ success: true });
    } else {
      writeLocalJsonDb("treatments", treatments);
      await createAuditLog("UPDATE_RECORD", "SUCCESS", req.user?.id || null, req.user?.email || null, req, `Bulk upserted ${treatments.length} treatments (local fallback)`);
      return res.json({ success: true });
    }
  } catch (err) {
    console.error("Post treatments failed:", err);
    return res.status(500).json({ error: "Failed to update treatments" });
  }
});

// 5. Invoices Endpoint
app.get("/api/invoices", authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN", "DOCTOR", "RECEPTIONIST", "PATIENT"]), async (req: AuthenticatedRequest, res) => {
  try {
    if (prisma) {
      let patientIdFilter: string | null = null;
      if (req.user?.role === "PATIENT") {
        const patient = await prisma.patient.findFirst({
          where: { OR: [{ id: req.user.id }, { userId: req.user.id }] }
        });
        patientIdFilter = patient ? patient.id : req.user.id;
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;

      const dbInvoices = await prisma.invoice.findMany({
        where: patientIdFilter ? { patientId: patientIdFilter } : undefined,
        include: {
          items: true,
          payments: true
        },
        take: limit && !isNaN(limit) ? limit : undefined,
        skip: offset && !isNaN(offset) ? offset : undefined,
      });
      const mapped = dbInvoices.map(inv => ({
        id: inv.id,
        patientId: inv.patientId,
        appointmentId: inv.appointmentId || undefined,
        treatmentPlanId: inv.treatmentPlanId || undefined,
        date: inv.date.toISOString().slice(0, 10),
        dueDate: inv.dueDate.toISOString().slice(0, 10),
        items: (inv.items || []).map((it: any) => ({
          id: it.id,
          description: it.description,
          quantity: it.quantity,
          unitPrice: Number(it.unitPrice || 0)
        })),
        discount: Number(inv.discount || 0),
        tax: Number(inv.tax || 0),
        status: mapInvoiceStatusToDisplay(inv.status),
        payments: (inv.payments || []).map((p: any) => ({
          id: p.id,
          date: p.date.toISOString().slice(0, 10),
          amount: Number(p.amount || 0),
          method: mapPaymentMethodToDisplay(p.method),
          notes: p.notes || ""
        })),
        totalAmount: Number(inv.totalAmount || 0),
        paidAmount: Number(inv.paidAmount || 0),
        createdAt: inv.createdAt.toISOString()
      }));
      return res.json(mapped);
    } else {
      const local = readLocalJsonDb();
      return res.json(local.invoices || []);
    }
  } catch (err) {
    console.error("Get invoices failed:", err);
    return res.status(500).json({ error: "Failed to get invoices" });
  }
});

app.post("/api/invoices", authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN", "DOCTOR", "RECEPTIONIST"]), async (req: AuthenticatedRequest, res) => {
  const validation = z.array(InvoiceSchema).safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: "Invalid request payload", details: validation.error.issues });
  }
  const invoices = validation.data;
  try {
    const lockedMonths = await getLockedMonthsList();
    const postedIds = invoices.map(inv => inv.id);

    if (prisma) {
      const existingInvoices = await prisma.invoice.findMany();
      const affectedInvoices = existingInvoices.filter(inv => {
        const isBeingDeleted = !postedIds.includes(inv.id);
        const isBeingModified = postedIds.includes(inv.id);
        return isBeingDeleted || isBeingModified;
      });
      const hasLockedAffected = affectedInvoices.some(inv => {
        const month = inv.date.toISOString().slice(0, 7);
        return lockedMonths.includes(month);
      });
      // Also check newly added invoices
      const hasLockedNew = invoices.some(inv => {
        const month = inv.date.slice(0, 7);
        return lockedMonths.includes(month) && !existingInvoices.some(e => e.id === inv.id);
      });
      if (hasLockedAffected || hasLockedNew) {
        return res.status(403).json({ error: "Cannot modify or delete invoices in locked months." });
      }
    } else {
      const local = readLocalJsonDb();
      const existingInvoices = local.invoices || [];
      const affectedInvoices = existingInvoices.filter((inv: any) => {
        const isBeingDeleted = !postedIds.includes(inv.id);
        const isBeingModified = postedIds.includes(inv.id);
        return isBeingDeleted || isBeingModified;
      });
      const hasLockedAffected = affectedInvoices.some((inv: any) => {
        const month = inv.date.slice(0, 7);
        return lockedMonths.includes(month);
      });
      const hasLockedNew = invoices.some(inv => {
        const month = inv.date.slice(0, 7);
        return lockedMonths.includes(month) && !existingInvoices.some((e: any) => e.id === inv.id);
      });
      if (hasLockedAffected || hasLockedNew) {
        return res.status(403).json({ error: "Cannot modify or delete invoices in locked months." });
      }
    }

    if (prisma) {
      const existingInvoices = await prisma.invoice.findMany({
        include: { items: true, payments: true }
      });
      const existingMap = new Map(existingInvoices.map(inv => [inv.id, inv]));

      const result = await prisma.$transaction(async (tx) => {
        for (const inv of invoices) {
          const existing = existingMap.get(inv.id);
          let isChanged = !existing;
          if (existing) {
            const extDateStr = existing.date.toISOString().slice(0, 10);
            const invDateStr = inv.date.slice(0, 10);
            const extDueDateStr = existing.dueDate.toISOString().slice(0, 10);
            const invDueDateStr = inv.dueDate.slice(0, 10);
            
            const itemsSum = (inv.items || []).reduce((sum: number, it: any) => sum + (Number(it.quantity || 1) * Number(it.unitPrice || 0)), 0);
            const afterDiscount = Math.max(0, itemsSum - Number(inv.discount || 0));
            const taxRate = Number(inv.tax || 0);
            const serverComputedTotal = Number((afterDiscount * (1 + taxRate / 100)).toFixed(2));
            const paymentsSum = (inv.payments || []).reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);

            let calculatedStatus: InvoiceStatus = InvoiceStatus.UNPAID;
            const mappedInputStatus = mapInvoiceStatusToEnum(inv.status || "Unpaid");
            if (mappedInputStatus === InvoiceStatus.CANCELLED) {
              calculatedStatus = InvoiceStatus.CANCELLED;
            } else if (paymentsSum >= serverComputedTotal && serverComputedTotal > 0) {
              calculatedStatus = InvoiceStatus.PAID;
            } else if (paymentsSum > 0) {
              calculatedStatus = InvoiceStatus.PARTIALLY_PAID;
            }

            if (
              existing.patientId !== inv.patientId ||
              existing.appointmentId !== (inv.appointmentId || null) ||
              existing.treatmentPlanId !== (inv.treatmentPlanId || null) ||
              extDateStr !== invDateStr ||
              extDueDateStr !== invDueDateStr ||
              Number(existing.discount) !== Number(inv.discount || 0) ||
              Number(existing.tax) !== Number(inv.tax || 0) ||
              existing.status !== calculatedStatus ||
              Number(existing.totalAmount) !== serverComputedTotal ||
              Number(existing.paidAmount) !== paymentsSum
            ) {
              isChanged = true;
            } else {
              const extItems = existing.items || [];
              const invItems = inv.items || [];
              if (extItems.length !== invItems.length) {
                isChanged = true;
              } else {
                for (let i = 0; i < extItems.length; i++) {
                  const itExt = extItems[i];
                  const itIn = invItems[i];
                  if (
                    itExt.description !== itIn.description ||
                    Number(itExt.quantity) !== Number(itIn.quantity || 1) ||
                    Number(itExt.unitPrice) !== Number(itIn.unitPrice || 0)
                  ) {
                    isChanged = true;
                    break;
                  }
                }
              }

              if (!isChanged) {
                const extPayments = existing.payments || [];
                const invPayments = inv.payments || [];
                if (extPayments.length !== invPayments.length) {
                  isChanged = true;
                } else {
                  for (let i = 0; i < extPayments.length; i++) {
                    const pExt = extPayments[i];
                    const pIn = invPayments[i];
                    const pExtDateStr = pExt.date.toISOString().slice(0, 10);
                    const pInDateStr = pIn.date.slice(0, 10);
                    if (
                      pExtDateStr !== pInDateStr ||
                      Number(pExt.amount) !== Number(pIn.amount || 0) ||
                      mapPaymentMethodToEnum(pExt.method) !== mapPaymentMethodToEnum(pIn.method || "Cash") ||
                      (pExt.notes || "") !== (pIn.notes || "")
                    ) {
                      isChanged = true;
                      break;
                    }
                  }
                }
              }
            }
          }

          if (!isChanged) {
            continue; // Skip unchanged invoices to save database transaction overhead (Critical Finding 4.1, 4.2)
          }

          // Perform secure server-side recalculation of totalAmount and paidAmount to prevent client-side spoofing
          const itemsSum = (inv.items || []).reduce((sum: number, it: any) => sum + (Number(it.quantity || 1) * Number(it.unitPrice || 0)), 0);
          const afterDiscount = Math.max(0, itemsSum - Number(inv.discount || 0));
          const taxRate = Number(inv.tax || 0);
          const serverComputedTotal = Number((afterDiscount * (1 + taxRate / 100)).toFixed(2));

          const paymentsSum = (inv.payments || []).reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);

          // Determine status authoritatively on the server
          let calculatedStatus: InvoiceStatus = InvoiceStatus.UNPAID;
          const mappedInputStatus = mapInvoiceStatusToEnum(inv.status || "Unpaid");
          if (mappedInputStatus === InvoiceStatus.CANCELLED) {
            calculatedStatus = InvoiceStatus.CANCELLED;
          } else if (paymentsSum >= serverComputedTotal && serverComputedTotal > 0) {
            calculatedStatus = InvoiceStatus.PAID;
          } else if (paymentsSum > 0) {
            calculatedStatus = InvoiceStatus.PARTIALLY_PAID;
          }

          await tx.invoice.upsert({
            where: { id: inv.id },
            update: {
              patientId: inv.patientId,
              appointmentId: inv.appointmentId || null,
              treatmentPlanId: inv.treatmentPlanId || null,
              date: new Date(inv.date),
              dueDate: new Date(inv.dueDate),
              discount: inv.discount || 0,
              tax: inv.tax || 0,
              status: calculatedStatus,
              totalAmount: serverComputedTotal,
              paidAmount: paymentsSum,
            },
            create: {
              id: inv.id,
              patientId: inv.patientId,
              appointmentId: inv.appointmentId || null,
              treatmentPlanId: inv.treatmentPlanId || null,
              date: new Date(inv.date),
              dueDate: new Date(inv.dueDate),
              discount: inv.discount || 0,
              tax: inv.tax || 0,
              status: calculatedStatus,
              totalAmount: serverComputedTotal,
              paidAmount: paymentsSum,
            }
          });

          // Recreate items within transaction
          await tx.invoiceItem.deleteMany({ where: { invoiceId: inv.id } });
          if (inv.items && inv.items.length > 0) {
            await tx.invoiceItem.createMany({
              data: inv.items.map((it: any) => ({
                id: it.id,
                invoiceId: inv.id,
                description: it.description,
                quantity: it.quantity || 1,
                unitPrice: it.unitPrice || 0
              }))
            });
          }

          // Recreate payments within transaction
          await tx.payment.deleteMany({ where: { invoiceId: inv.id } });
          if (inv.payments && inv.payments.length > 0) {
            await tx.payment.createMany({
              data: inv.payments.map((p: any) => ({
                id: p.id,
                invoiceId: inv.id,
                date: new Date(p.date),
                amount: p.amount || 0,
                method: mapPaymentMethodToEnum(p.method || "Cash"),
                notes: p.notes || null
              }))
            });
          }
        }

        const touchedPatientIds = new Set<string>();
        for (const inv of invoices) {
          touchedPatientIds.add(inv.patientId);
        }
        for (const pId of touchedPatientIds) {
          await recalculatePatientBalanceServer(pId, tx);
        }

        return { success: true };
      });

      await createAuditLog("UPDATE_RECORD", "SUCCESS", req.user?.id || null, req.user?.email || null, req, `Bulk upserted ${invoices.length} invoices`);
      return res.json({ success: true });
    } else {
      writeLocalJsonDb("invoices", invoices);
      await createAuditLog("UPDATE_RECORD", "SUCCESS", req.user?.id || null, req.user?.email || null, req, `Bulk upserted ${invoices.length} invoices (local fallback)`);
      return res.json({ success: true });
    }
  } catch (err) {
    console.error("Post invoices failed:", err);
    return res.status(500).json({ error: "Failed to update invoices" });
  }
});

app.post("/api/invoices/:id/payments", authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN", "DOCTOR", "RECEPTIONIST"]), async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { amount, method, notes, date } = req.body;
  const numericAmount = Number(amount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ error: "Amount must be a valid positive number" });
  }

  try {
    if (prisma) {
      const invoice = await prisma.invoice.findUnique({
        where: { id },
        include: { payments: true }
      });

      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      const lockedMonths = await getLockedMonthsList();
      const month = invoice.date.toISOString().slice(0, 7);
      if (lockedMonths.includes(month)) {
        return res.status(403).json({ error: "Cannot add payment to an invoice in a locked month." });
      }

      // Add new payment
      await prisma.payment.create({
        data: {
          id: crypto.randomUUID(),
          invoiceId: id,
          amount: numericAmount,
          method: mapPaymentMethodToEnum(method || "Cash"),
          notes: notes || null,
          date: date ? new Date(date) : new Date()
        }
      });

      // Recalculate paidAmount and update status
      const allPayments = await prisma.payment.findMany({
        where: { invoiceId: id }
      });

      const totalPaid = allPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const totalAmount = Number(invoice.totalAmount);

      let newStatus: InvoiceStatus = invoice.status;
      if (invoice.status !== InvoiceStatus.CANCELLED) {
        if (totalPaid >= totalAmount && totalAmount > 0) {
          newStatus = InvoiceStatus.PAID;
        } else if (totalPaid > 0) {
          newStatus = InvoiceStatus.PARTIALLY_PAID;
        }
      }

      await prisma.invoice.update({
        where: { id },
        data: {
          paidAmount: totalPaid,
          status: newStatus
        }
      });

      // Perform database trigger logic to recalculate patient balance in server-side transaction
      await recalculatePatientBalanceServer(invoice.patientId);

      return res.json({ success: true, paidAmount: totalPaid, status: newStatus });
    } else {
      const local = readLocalJsonDb();
      const invoices = local.invoices || [];
      const invoiceIndex = invoices.findIndex((inv: any) => inv.id === id);
      if (invoiceIndex === -1) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      const invoice = invoices[invoiceIndex];
      const lockedMonths = await getLockedMonthsList();
      const month = (invoice.date || "").slice(0, 7);
      if (lockedMonths.includes(month)) {
        return res.status(403).json({ error: "Cannot add payment to an invoice in a locked month." });
      }

      // Add new payment to local payments list inside invoice
      if (!invoice.payments) {
        invoice.payments = [];
      }
      const newPayment = {
        id: crypto.randomUUID(),
        invoiceId: id,
        amount: numericAmount,
        method: method || "Cash",
        notes: notes || null,
        date: date || new Date().toISOString()
      };
      invoice.payments.push(newPayment);

      const totalPaid = invoice.payments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
      const totalAmount = Number(invoice.totalAmount);

      let newStatus = invoice.status || "Unpaid";
      if (invoice.status !== "Cancelled" && invoice.status !== "CANCELLED") {
        if (totalPaid >= totalAmount && totalAmount > 0) {
          newStatus = "Paid";
        } else if (totalPaid > 0) {
          newStatus = "Partially Paid";
        }
      }

      invoice.paidAmount = totalPaid;
      invoice.status = newStatus;

      writeLocalJsonDb("invoices", invoices);

      return res.json({ success: true, paidAmount: totalPaid, status: newStatus });
    }
  } catch (err) {
    console.error("Failed to add payment:", err);
    return res.status(500).json({ error: "Failed to add payment" });
  }
});

// Revenue Share Rules Endpoints (C-5 & C-6)
app.get("/api/revenue-share-rules", authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN"]), async (req, res) => {
  try {
    if (prisma) {
      const rules = await prisma.revenueShareRule.findMany({
        include: { doctor: { include: { user: true } } }
      });
      return res.json(rules.map(r => ({
        id: r.id,
        doctorId: r.doctorId,
        doctorEmail: r.doctor?.user?.email,
        partnerSharePct: Number(r.partnerSharePct),
        selfSharePct: Number(r.selfSharePct),
        effectiveFrom: r.effectiveFrom.toISOString().slice(0, 10),
        effectiveTo: r.effectiveTo ? r.effectiveTo.toISOString().slice(0, 10) : null
      })));
    } else {
      const local = readLocalJsonDb();
      return res.json(local.revenue_share_rules || []);
    }
  } catch (err) {
    console.error("Failed to get revenue share rules:", err);
    return res.status(500).json({ error: "Failed to get revenue share rules" });
  }
});

app.post("/api/revenue-share-rules", authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN"]), async (req, res) => {
  const { doctorId, partnerSharePct, selfSharePct, effectiveFrom, effectiveTo } = req.body;
  try {
    const rule = await prisma.revenueShareRule.create({
      data: {
        id: crypto.randomUUID(),
        doctorId,
        partnerSharePct: Number(partnerSharePct),
        selfSharePct: Number(selfSharePct),
        effectiveFrom: new Date(effectiveFrom),
        effectiveTo: effectiveTo ? new Date(effectiveTo) : null
      }
    });
    return res.json(rule);
  } catch (err) {
    console.error("Failed to create rule:", err);
    return res.status(500).json({ error: "Failed to create rule" });
  }
});

// 6. Expenses Endpoint
app.get("/api/expenses", authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN", "DOCTOR"]), async (req, res) => {
  try {
    if (prisma) {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;

      const dbExpenses = await prisma.expense.findMany({
        include: { supplier: true },
        take: limit && !isNaN(limit) ? limit : undefined,
        skip: offset && !isNaN(offset) ? offset : undefined,
      });
      const mapped = dbExpenses.map(exp => ({
        id: exp.id,
        category: exp.category,
        description: exp.description || "",
        amount: Number(exp.amount || 0),
        supplier: exp.supplier?.name || "",
        date: exp.date.toISOString().slice(0, 10),
        createdAt: exp.createdAt.toISOString()
      }));
      return res.json(mapped);
    } else {
      const local = readLocalJsonDb();
      return res.json(local.expenses || []);
    }
  } catch (err) {
    console.error("Get expenses failed:", err);
    return res.status(500).json({ error: "Failed to get expenses" });
  }
});

app.post("/api/expenses", authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN", "DOCTOR"]), async (req, res) => {
  const validation = z.array(ExpenseSchema).safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: "Invalid request payload", details: validation.error.issues });
  }
  const expenses = validation.data;
  try {
    const lockedMonths = await getLockedMonthsList();
    const postedIds = expenses.map(exp => exp.id);

    if (prisma) {
      const existingExpenses = await prisma.expense.findMany();
      const affectedExpenses = existingExpenses.filter(exp => {
        const isBeingDeleted = !postedIds.includes(exp.id);
        const isBeingModified = postedIds.includes(exp.id);
        return isBeingDeleted || isBeingModified;
      });
      const hasLockedAffected = affectedExpenses.some(exp => {
        const month = exp.date.toISOString().slice(0, 7);
        return lockedMonths.includes(month);
      });
      const hasLockedNew = expenses.some(exp => {
        const month = exp.date.slice(0, 7);
        return lockedMonths.includes(month) && !existingExpenses.some(e => e.id === exp.id);
      });
      if (hasLockedAffected || hasLockedNew) {
        return res.status(403).json({ error: "Cannot modify or delete expenses in locked months." });
      }
    } else {
      const local = readLocalJsonDb();
      const existingExpenses = local.expenses || [];
      const affectedExpenses = existingExpenses.filter((exp: any) => {
        const isBeingDeleted = !postedIds.includes(exp.id);
        const isBeingModified = postedIds.includes(exp.id);
        return isBeingDeleted || isBeingModified;
      });
      const hasLockedAffected = affectedExpenses.some((exp: any) => {
        const month = exp.date.slice(0, 7);
        return lockedMonths.includes(month);
      });
      const hasLockedNew = expenses.some(exp => {
        const month = exp.date.slice(0, 7);
        return lockedMonths.includes(month) && !existingExpenses.some((e: any) => e.id === exp.id);
      });
      if (hasLockedAffected || hasLockedNew) {
        return res.status(403).json({ error: "Cannot modify or delete expenses in locked months." });
      }
    }

    if (prisma) {
      await prisma.$transaction(async (tx) => {
        for (const exp of expenses) {
          let supplierId: string | null = null;
          if (exp.supplier) {
            let sRecord = await tx.supplier.findFirst({
              where: { name: exp.supplier }
            });
            if (!sRecord) {
              sRecord = await tx.supplier.create({
                data: { name: exp.supplier }
              });
            }
            supplierId = sRecord.id;
          }

          await tx.expense.upsert({
            where: { id: exp.id },
            update: {
              category: exp.category,
              description: exp.description || null,
              amount: exp.amount || 0,
              supplierId,
              date: new Date(exp.date),
            },
            create: {
              id: exp.id,
              category: exp.category,
              description: exp.description || null,
              amount: exp.amount || 0,
              supplierId,
              date: new Date(exp.date),
            }
          });
        }
      });
      await createAuditLog("UPDATE_RECORD", "SUCCESS", (req as any).user?.id || null, (req as any).user?.email || null, req, `Bulk upserted ${expenses.length} expenses`);
      return res.json({ success: true });
    } else {
      writeLocalJsonDb("expenses", expenses);
      await createAuditLog("UPDATE_RECORD", "SUCCESS", (req as any).user?.id || null, (req as any).user?.email || null, req, `Bulk upserted ${expenses.length} expenses (local fallback)`);
      return res.json({ success: true });
    }
  } catch (err) {
    console.error("Post expenses failed:", err);
    return res.status(500).json({ error: "Failed to update expenses" });
  }
});

// 7. Inventory Endpoint
app.get("/api/inventory", authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN", "DOCTOR", "RECEPTIONIST"]), async (req, res) => {
  try {
    if (prisma) {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;

      const dbInventory = await prisma.inventory.findMany({
        include: { supplier: true },
        take: limit && !isNaN(limit) ? limit : undefined,
        skip: offset && !isNaN(offset) ? offset : undefined,
      });
      const mapped = dbInventory.map(item => ({
        id: item.id,
        name: item.name,
        category: item.category,
        sku: item.sku || "",
        quantity: item.quantity,
        supplier: item.supplier?.name || "",
        unitPrice: Number(item.unitPrice || 0),
        minQuantity: item.minQuantity,
        expirationDate: item.expirationDate ? item.expirationDate.toISOString().slice(0, 10) : undefined,
        storageLocation: item.storageLocation || "",
        status: mapInventoryStatusToDisplay(item.status),
        createdAt: item.createdAt.toISOString()
      }));
      return res.json(mapped);
    } else {
      const local = readLocalJsonDb();
      return res.json(local.inventory || []);
    }
  } catch (err) {
    console.error("Get inventory failed:", err);
    return res.status(500).json({ error: "Failed to get inventory" });
  }
});

app.post("/api/inventory", authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN", "DOCTOR"]), async (req, res) => {
  const validation = z.array(InventorySchema).safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: "Invalid request payload", details: validation.error.issues });
  }
  const inventory = validation.data;
  try {
    if (prisma) {
      await prisma.$transaction(async (tx) => {
        for (const item of inventory) {
          let supplierId: string | null = null;
          if (item.supplier) {
            let sRecord = await tx.supplier.findFirst({
              where: { name: item.supplier }
            });
            if (!sRecord) {
              sRecord = await tx.supplier.create({
                data: { name: item.supplier }
              });
            }
            supplierId = sRecord.id;
          }

          await tx.inventory.upsert({
            where: { id: item.id },
            update: {
              name: item.name,
              category: item.category,
              sku: item.sku || null,
              quantity: item.quantity || 0,
              supplierId,
              unitPrice: item.unitPrice || 0,
              minQuantity: item.minQuantity || 10,
              expirationDate: item.expirationDate ? new Date(item.expirationDate) : null,
              storageLocation: item.storageLocation || null,
              status: mapInventoryStatusToEnum(item.status || "In Stock"),
            },
            create: {
              id: item.id,
              name: item.name,
              category: item.category,
              sku: item.sku || null,
              quantity: item.quantity || 0,
              supplierId,
              unitPrice: item.unitPrice || 0,
              minQuantity: item.minQuantity || 10,
              expirationDate: item.expirationDate ? new Date(item.expirationDate) : null,
              storageLocation: item.storageLocation || null,
              status: mapInventoryStatusToEnum(item.status || "In Stock"),
            }
          });
        }
      });
      await createAuditLog("UPDATE_RECORD", "SUCCESS", (req as any).user?.id || null, (req as any).user?.email || null, req, `Bulk upserted ${inventory.length} inventory items`);
      return res.json({ success: true });
    } else {
      writeLocalJsonDb("inventory", inventory);
      await createAuditLog("UPDATE_RECORD", "SUCCESS", (req as any).user?.id || null, (req as any).user?.email || null, req, `Bulk upserted ${inventory.length} inventory items (local fallback)`);
      return res.json({ success: true });
    }
  } catch (err) {
    console.error("Post inventory failed:", err);
    return res.status(500).json({ error: "Failed to update inventory" });
  }
});

// 8. Notifications Endpoint
app.get("/api/notifications", authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN", "DOCTOR", "RECEPTIONIST", "PATIENT"]), async (req: AuthenticatedRequest, res) => {
  try {
    if (prisma) {
      let patientIdFilter: string | null = null;
      if (req.user?.role === "PATIENT") {
        const patient = await prisma.patient.findFirst({
          where: { OR: [{ id: req.user.id }, { userId: req.user.id }] }
        });
        patientIdFilter = patient ? patient.id : req.user.id;
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;

      const dbNotifications = await prisma.notification.findMany({
        where: patientIdFilter ? { patientId: patientIdFilter } : undefined,
        orderBy: { createdAt: "desc" },
        take: limit && !isNaN(limit) ? limit : undefined,
        skip: offset && !isNaN(offset) ? offset : undefined,
      });
      const mapped = dbNotifications.map(n => ({
        id: n.id,
        type: mapNotificationTypeToDisplay(n.type),
        priority: mapNotificationPriorityToDisplay(n.priority),
        title: n.title,
        message: n.message,
        read: n.read,
        patientId: n.patientId || undefined,
        actionUrl: n.actionUrl || undefined,
        createdAt: n.createdAt.toISOString()
      }));
      return res.json(mapped);
    } else {
      const local = readLocalJsonDb();
      let list = local.notifications || [];
      if (req.user?.role === "PATIENT") {
        const patient = (local.patients || []).find((p: any) => p.id === req.user?.id || p.userId === req.user?.id);
        const pid = patient ? patient.id : req.user?.id;
        list = list.filter((n: any) => n.patientId === pid);
      }
      return res.json(list);
    }
  } catch (err) {
    console.error("Get notifications failed:", err);
    return res.status(500).json({ error: "Failed to get notifications" });
  }
});

app.post("/api/notifications", authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN", "DOCTOR", "RECEPTIONIST"]), async (req: AuthenticatedRequest, res) => {
  const validation = z.array(NotificationSchema).safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: "Invalid request payload", details: validation.error.issues });
  }
  const notifications = validation.data;
  try {
    if (prisma) {
      await prisma.$transaction(async (tx) => {
        for (const n of notifications) {
          await tx.notification.upsert({
            where: { id: n.id },
            update: {
              type: mapNotificationTypeToEnum(n.type),
              priority: mapNotificationPriorityToEnum(n.priority),
              title: n.title,
              message: n.message,
              read: n.read,
              patientId: n.patientId || null,
              actionUrl: n.actionUrl || null,
              createdAt: new Date(n.createdAt),
            },
            create: {
              id: n.id,
              type: mapNotificationTypeToEnum(n.type),
              priority: mapNotificationPriorityToEnum(n.priority),
              title: n.title,
              message: n.message,
              read: n.read,
              patientId: n.patientId || null,
              actionUrl: n.actionUrl || null,
              createdAt: new Date(n.createdAt),
            }
          });
        }
      });
      await createAuditLog("UPDATE_RECORD", "SUCCESS", req.user?.id || null, req.user?.email || null, req, `Bulk upserted ${notifications.length} notifications`);
      return res.json({ success: true });
    } else {
      writeLocalJsonDb("notifications", notifications);
      await createAuditLog("UPDATE_RECORD", "SUCCESS", req.user?.id || null, req.user?.email || null, req, `Bulk upserted ${notifications.length} notifications (local fallback)`);
      return res.json({ success: true });
    }
  } catch (err) {
    console.error("Post notifications failed:", err);
    return res.status(500).json({ error: "Failed to update notifications" });
  }
});

// 9. Dental Charts Endpoint
app.get("/api/dental-charts", authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN", "DOCTOR", "PATIENT"]), async (req: AuthenticatedRequest, res) => {
  try {
    if (prisma) {
      let patientIdFilter: string | null = null;
      if (req.user?.role === "PATIENT") {
        const patient = await prisma.patient.findFirst({
          where: { OR: [{ id: req.user.id }, { userId: req.user.id }] }
        });
        patientIdFilter = patient ? patient.id : req.user.id;
      }

      const dbCharts = await prisma.dentalChart.findMany({
        where: patientIdFilter ? { patientId: patientIdFilter } : undefined
      });
      const result: Record<string, any> = {};
      dbCharts.forEach(c => {
        result[c.patientId] = {
          patientId: c.patientId,
          isChild: c.isChild,
          teeth: c.teethData
        };
      });
      return res.json(result);
    } else {
      const local = readLocalJsonDb();
      return res.json(local.dental_charts || {});
    }
  } catch (err) {
    console.error("Get dental charts failed:", err);
    return res.status(500).json({ error: "Failed to get dental charts" });
  }
});

app.post("/api/dental-charts", authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN", "DOCTOR"]), async (req: AuthenticatedRequest, res) => {
  const validation = z.record(z.string(), DentalChartSchema).safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: "Invalid request payload", details: validation.error.issues });
  }
  const charts = validation.data;
  try {
    if (prisma) {
      await prisma.$transaction(async (tx) => {
        for (const [patientId, chart] of Object.entries(charts)) {
          await tx.dentalChart.upsert({
            where: { patientId: patientId },
            update: {
              isChild: chart.isChild ?? false,
              teethData: chart.teeth as any,
            },
            create: {
              patientId: patientId,
              isChild: chart.isChild ?? false,
              teethData: chart.teeth as any,
            }
          });
        }
      });
      await createAuditLog("UPDATE_RECORD", "SUCCESS", req.user?.id || null, req.user?.email || null, req, `Updated clinical dental charts for ${Object.keys(charts).length} patients`);
      return res.json({ success: true });
    } else {
      writeLocalJsonDb("dental_charts", charts);
      return res.json({ success: true });
    }
  } catch (err) {
    console.error("Post dental charts failed:", err);
    return res.status(500).json({ error: "Failed to update dental charts" });
  }
});

// 10. Settlements Endpoints
const SettlementSchema = z.object({
  month: z.string(),
  totalRevenue: z.number(),
  totalExpenses: z.number(),
  totalNetProfit: z.number(),
  unpaidInvoicesSum: z.number().optional(),
  unpaidTreatmentsSum: z.number().optional(),
  unpaidConsultationsSum: z.number().optional(),
  distributions: z.record(z.string(), z.object({
    doctorEmail: z.string(),
    doctorName: z.string(),
    appointmentRevenue: z.number(),
    treatmentRevenue: z.number(),
    manualInvoiceRevenue: z.number(),
    totalGrossRevenue: z.number(),
    shareOfExpenses: z.number(),
    netProfit: z.number()
  }))
});

app.get("/api/settlements", authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN", "DOCTOR"]), async (req, res) => {
  try {
    if (prisma) {
      const dbSettlements = await prisma.setting.findMany({
        where: {
          key: {
            startsWith: "settlement:"
          }
        }
      });
      const parsed = dbSettlements.map(s => {
        try {
          return JSON.parse(s.value);
        } catch {
          return null;
        }
      }).filter(Boolean);
      return res.json(parsed);
    } else {
      const local = readLocalJsonDb();
      return res.json(local.settlements || []);
    }
  } catch (err) {
    console.error("Get settlements failed:", err);
    return res.status(500).json({ error: "Failed to get settlements" });
  }
});

app.post("/api/settlements", authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN", "DOCTOR"]), async (req, res) => {
  const validation = SettlementSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: "Invalid request payload", details: validation.error.issues });
  }
  const settlement = validation.data;
  try {
    if (prisma) {
      await prisma.setting.upsert({
        where: { key: `settlement:${settlement.month}` },
        update: { value: JSON.stringify(settlement) },
        create: {
          key: `settlement:${settlement.month}`,
          value: JSON.stringify(settlement)
        }
      });
      return res.json({ success: true });
    } else {
      const local = readLocalJsonDb();
      if (!local.settlements) {
        local.settlements = [];
      }
      const index = local.settlements.findIndex((s: any) => s.month === settlement.month);
      if (index > -1) {
        local.settlements[index] = settlement;
      } else {
        local.settlements.push(settlement);
      }
      writeLocalJsonDb("settlements", local.settlements);
      return res.json({ success: true });
    }
  } catch (err) {
    console.error("Post settlement failed:", err);
    return res.status(500).json({ error: "Failed to update settlement" });
  }
});

// Helper: Get list of locked months
async function getLockedMonthsList(): Promise<string[]> {
  try {
    if (prisma) {
      const dbLocks = await prisma.setting.findUnique({
        where: { key: "month_locks" }
      });
      if (dbLocks) {
        return JSON.parse(dbLocks.value);
      }
    } else {
      const local = readLocalJsonDb();
      return local.month_locks || [];
    }
  } catch (e) {
    console.error("Failed to get locked months list:", e);
  }
  return [];
}

// Helper: Generate missing profit transactions for payments
async function generateServerProfitTransactions() {
  try {
    if (prisma) {
      const invoices = await prisma.invoice.findMany({
        include: { payments: true, treatmentPlan: true }
      });
      const appointments = await prisma.appointment.findMany({
        include: { doctor: { include: { user: true } } }
      });
      
      const allPayments = await prisma.payment.findMany();
      const paymentIdToAmount = new Map(allPayments.map(p => [p.id, Number(p.amount)]));

      const existingTx = await prisma.profitTransaction.findMany();
      const txToDelete: string[] = [];
      for (const tx of existingTx) {
        if (!paymentIdToAmount.has(tx.paymentId)) {
          txToDelete.push(tx.id);
        } else if (Math.abs(Number(tx.amount) - paymentIdToAmount.get(tx.paymentId)!) > 0.01) {
          txToDelete.push(tx.id);
        }
      }
      if (txToDelete.length > 0) {
        await prisma.profitTransaction.deleteMany({
          where: { id: { in: txToDelete } }
        });
      }

      const currentTx = await prisma.profitTransaction.findMany();
      const existingPaymentIds = new Set(currentTx.map(t => t.paymentId));

      const newTransactions = [];

      for (const inv of invoices) {
        const statusStr = String(inv.status || "").toUpperCase();
        if (statusStr === "CANCELED" || statusStr === "CANCELLED") continue;
        for (const pay of inv.payments) {
          if (existingPaymentIds.has(pay.id)) continue;

          let type = "Manual";
          let drAmrShare = 0;
          let drBaselShare = 0;
          const amount = Number(pay.amount || 0);

          let docId: string | null = null;
          let docEmail = "";

          if (inv.treatmentPlanId) {
            type = "Treatment";
            docId = inv.treatmentPlan?.doctorId || null;
            if (docId) {
              const docObj = await prisma.doctor.findUnique({
                where: { id: docId },
                include: { user: true }
              });
              docEmail = docObj?.user?.email || "";
            } else {
              const patientAppts = appointments
                .filter(app => app.patientId === inv.patientId)
                .sort((a, b) => b.date.getTime() - a.date.getTime());
              const latestApp = patientAppts[0];
              docId = latestApp?.doctorId || null;
              docEmail = latestApp?.doctor?.user?.email || "";
            }
          } else if (inv.appointmentId) {
            type = "Appointment";
            const appt = appointments.find(a => a.id === inv.appointmentId);
            if (appt && appt.status === "COMPLETED") {
              docId = appt.doctorId || null;
              docEmail = appt.doctor?.user?.email || "";
            } else {
              continue;
            }
          }

          let selfPct = 65;
          let partnerPct = 35;

          if (docId) {
            const rule = await prisma.revenueShareRule.findFirst({
              where: {
                doctorId: docId,
                effectiveFrom: { lte: pay.date },
                OR: [
                  { effectiveTo: null },
                  { effectiveTo: { gte: pay.date } }
                ]
              }
            });
            if (rule) {
              selfPct = Number(rule.selfSharePct);
              partnerPct = Number(rule.partnerSharePct);
            }
          }

          if (docId === "doc-amr") {
            drAmrShare = amount * (selfPct / 100);
            drBaselShare = amount * (partnerPct / 100);
          } else if (docId === "doc-basel") {
            drBaselShare = amount * (selfPct / 100);
            drAmrShare = amount * (partnerPct / 100);
          } else if (docId) {
            // A third doctor: they get selfPct, split partnerPct equally between Amr and Basel (the clinic partners)
            drAmrShare = amount * ((partnerPct / 2) / 100);
            drBaselShare = amount * ((partnerPct / 2) / 100);
          } else {
            // Manual/other fallback split equally
            drAmrShare = amount * 0.50;
            drBaselShare = amount * 0.50;
          }

          newTransactions.push({
            paymentId: pay.id,
            invoiceId: inv.id,
            date: pay.date,
            amount,
            type,
            drAmrShare,
            drBaselShare
          });
        }
      }

      if (newTransactions.length > 0) {
        for (const nt of newTransactions) {
          await prisma.profitTransaction.create({
            data: {
              paymentId: nt.paymentId,
              invoiceId: nt.invoiceId,
              date: nt.date,
              amount: nt.amount,
              type: nt.type,
              drAmrShare: nt.drAmrShare,
              drBaselShare: nt.drBaselShare
            }
          });
        }
        console.log(`Created ${newTransactions.length} server-side ProfitTransactions.`);
      }
    } else {
      const local = readLocalJsonDb();
      if (!local.profit_transactions) {
        local.profit_transactions = [];
      }
      const localInvoices = local.invoices || [];
      const allLocalPayments: any[] = [];
      for (const inv of localInvoices) {
        if (inv.payments) {
          allLocalPayments.push(...inv.payments);
        }
      }
      const localPaymentIdToAmount = new Map(allLocalPayments.map((p: any) => [p.id, Number(p.amount)]));

      let added = false;
      const originalCount = local.profit_transactions.length;
      local.profit_transactions = local.profit_transactions.filter((tx: any) => {
        if (!localPaymentIdToAmount.has(tx.paymentId)) {
          return false;
        }
        if (Math.abs(Number(tx.amount) - localPaymentIdToAmount.get(tx.paymentId)!) > 0.01) {
          return false;
        }
        return true;
      });
      if (local.profit_transactions.length !== originalCount) {
        added = true;
      }

      const existingPaymentIds = new Set(local.profit_transactions.map((t: any) => t.paymentId));
      const invoices = local.invoices || [];
      const appointments = local.appointments || [];

      // Loop over invoices to create missing profit transactions
      for (const inv of invoices) {
        const statusStr = String(inv.status || "").toUpperCase();
        if (statusStr === "CANCELED" || statusStr === "CANCELLED") continue;
        const payments = inv.payments || [];
        for (const pay of payments) {
          if (existingPaymentIds.has(pay.id)) continue;

          let type = "Manual";
          let drAmrShare = 0;
          let drBaselShare = 0;
          const amount = Number(pay.amount || 0);

          if (inv.treatmentPlanId) {
            type = "Treatment";
            const treatments = local.treatments || [];
            const txPlan = treatments.find((t: any) => t.id === inv.treatmentPlanId);
            let docEmail = "";
            if (txPlan && txPlan.doctorId) {
              const docObj = (local.doctors || []).find((d: any) => d.id === txPlan.doctorId);
              docEmail = docObj ? docObj.email : "";
            }
            if (!docEmail) {
              const patientAppts = appointments
                .filter((app: any) => app.patientId === inv.patientId)
                .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
              const latestApp = patientAppts[0];
              docEmail = latestApp ? latestApp.doctorEmail : "amr.eladawy@gmail.com";
            }
            
            if (docEmail === "amr.eladawy@gmail.com") {
              drAmrShare = amount * 0.65;
              drBaselShare = amount * 0.35;
            } else if (docEmail === "basel.elmorsy@gmail.com") {
              drAmrShare = amount * 0.35;
              drBaselShare = amount * 0.65;
            } else {
              drAmrShare = amount * 0.50;
              drBaselShare = amount * 0.50;
            }
          } else if (inv.appointmentId) {
            type = "Appointment";
            const appt = appointments.find((a: any) => a.id === inv.appointmentId);
            if (appt && appt.status === "Completed") {
              const docEmail = appt.doctorEmail || "amr.eladawy@gmail.com";
              if (docEmail === "amr.eladawy@gmail.com") {
                drAmrShare = amount * 0.65;
                drBaselShare = amount * 0.35;
              } else if (docEmail === "basel.elmorsy@gmail.com") {
                drAmrShare = amount * 0.35;
                drBaselShare = amount * 0.65;
              } else {
                drAmrShare = amount * 0.50;
                drBaselShare = amount * 0.50;
              }
            } else {
              continue;
            }
          } else {
            drAmrShare = amount * 0.50;
            drBaselShare = amount * 0.50;
          }

          local.profit_transactions.push({
            id: pay.id,
            paymentId: pay.id,
            invoiceId: inv.id,
            date: pay.date,
            amount,
            type,
            drAmrShare,
            drBaselShare,
            createdAt: new Date().toISOString()
          });
          added = true;
        }
      }

      if (added) {
        writeLocalJsonDb("profit_transactions", local.profit_transactions);
      }
    }
  } catch (err) {
    console.error("Failed to generate server profit transactions:", err);
  }
}

// Endpoint: Get list of locked months
app.get("/api/month-locks", authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN"]), async (req, res) => {
  try {
    const list = await getLockedMonthsList();
    return res.json(list);
  } catch (err) {
    console.error("Get month locks failed:", err);
    return res.status(500).json({ error: "Failed to get month locks" });
  }
});

// Endpoint: Update list of locked months
app.post("/api/month-locks", authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN"]), async (req: AuthenticatedRequest, res) => {
  try {
    const { month, action } = req.body; // action: "lock" | "unlock"
    if (!month) {
      return res.status(400).json({ error: "Month is required" });
    }

    let currentLocks = await getLockedMonthsList();
    if (action === "lock") {
      if (!currentLocks.includes(month)) {
        currentLocks.push(month);
      }
    } else if (action === "unlock") {
      currentLocks = currentLocks.filter(m => m !== month);
    } else {
      return res.status(400).json({ error: "Invalid action" });
    }

    if (prisma) {
      await prisma.setting.upsert({
        where: { key: "month_locks" },
        update: { value: JSON.stringify(currentLocks) },
        create: { key: "month_locks", value: JSON.stringify(currentLocks) }
      });
    } else {
      writeLocalJsonDb("month_locks", currentLocks);
    }

    return res.json({ success: true, lockedMonths: currentLocks });
  } catch (err) {
    console.error("Post month locks failed:", err);
    return res.status(500).json({ error: "Failed to update month locks" });
  }
});

// Endpoint: Get profit transactions list
app.get("/api/profit-transactions", authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN", "DOCTOR"]), async (req, res) => {
  try {
    await generateServerProfitTransactions();
    if (prisma) {
      const dbTx = await prisma.profitTransaction.findMany();
      const mapped = dbTx.map(t => ({
        id: t.id,
        paymentId: t.paymentId,
        invoiceId: t.invoiceId,
        date: t.date.toISOString().slice(0, 10),
        amount: Number(t.amount || 0),
        type: t.type,
        drAmrShare: Number(t.drAmrShare || 0),
        drBaselShare: Number(t.drBaselShare || 0),
        createdAt: t.createdAt.toISOString()
      }));
      return res.json(mapped);
    } else {
      const local = readLocalJsonDb();
      return res.json(local.profit_transactions || []);
    }
  } catch (err) {
    console.error("Get profit transactions failed:", err);
    return res.status(500).json({ error: "Failed to get profit transactions" });
  }
});

// Email Verification & Account Registration Endpoints
app.post("/api/auth/register", rateLimiter(5, 60 * 1000), async (req, res) => {
  const { name, phone, email, password } = req.body;
  if (!name || !phone || !email || !password) {
    return res.status(400).json({ error: "اسم المستخدم، رقم الهاتف، البريد الإلكتروني، وكلمة المرور مطلوبة." });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanPhone = phone.trim();

  try {
    if (prisma) {
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: cleanEmail }
      });

      if (existingUser) {
        if (existingUser.isVerified) {
          return res.status(400).json({ error: "البريد الإلكتروني مسجل بالفعل ومفعل. يرجى تسجيل الدخول." });
        } else {
          // Re-generate token and resend email
          const token = crypto.randomBytes(32).toString("hex");
          const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

          await prisma.user.update({
            where: { id: existingUser.id },
            data: {
              name,
              password: bcrypt.hashSync(password, 12),
              verificationToken: token,
              verificationExpires: expires
            }
          });

          await sendVerificationEmail(cleanEmail, name, token);
          return res.json({ success: true, message: "تم إرسال رابط تفعيل جديد لبريدك الإلكتروني." });
        }
      }

      // Check if phone already registered to another user (via patient profile)
      const existingPatientWithPhone = await prisma.patient.findFirst({
        where: { phone: cleanPhone },
        include: { user: true }
      });

      if (existingPatientWithPhone && existingPatientWithPhone.user) {
        return res.status(400).json({ error: "رقم الهاتف مسجل بالفعل لحساب آخر." });
      }

      // Create new inactive user
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const newUser = await prisma.user.create({
        data: {
          id: crypto.randomUUID(),
          name,
          email: cleanEmail,
          password: bcrypt.hashSync(password, 12),
          role: UserRole.PATIENT,
          isVerified: false,
          verificationToken: token,
          verificationExpires: expires
        }
      });

      // Link to existing Patient file (if matches phone) or create a new Patient file
      if (existingPatientWithPhone) {
        await prisma.patient.update({
          where: { id: existingPatientWithPhone.id },
          data: {
            userId: newUser.id,
            email: cleanEmail,
            name // Update name to match registration if needed
          }
        });
      } else {
        await prisma.patient.create({
          data: {
            id: crypto.randomUUID(),
            userId: newUser.id,
            name,
            phone: cleanPhone,
            email: cleanEmail,
            medicalConditions: [],
            allergies: [],
            isActive: true,
            totalSpent: 0,
            outstandingBalance: 0
          }
        });
      }

      await sendVerificationEmail(cleanEmail, name, token);
      return res.json({ success: true, message: "تم إنشاء الحساب بنجاح. يرجى مراجعة بريدك الإلكتروني لتفعيل الحساب." });
    } else {
      // In local fallback JSON DB mode (file-based)
      const local = readLocalJsonDb();
      const users = local.users || [];
      const patients = local.patients || [];

      const existingUser = users.find((u: any) => u.email === cleanEmail);
      if (existingUser) {
        if (existingUser.isVerified) {
          return res.status(400).json({ error: "البريد الإلكتروني مسجل بالفعل ومفعل." });
        } else {
          const token = crypto.randomBytes(32).toString("hex");
          existingUser.verificationToken = token;
          existingUser.verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          existingUser.password = password; // simple pass for fallback JSON
          existingUser.name = name;
          writeLocalJsonDb("users", users);
          await sendVerificationEmail(cleanEmail, name, token);
          return res.json({ success: true, message: "تم إرسال رابط تفعيل جديد لبريدك الإلكتروني." });
        }
      }

      const existingPatientWithPhone = patients.find((p: any) => p.phone === cleanPhone);
      if (existingPatientWithPhone && existingPatientWithPhone.password) {
        return res.status(400).json({ error: "رقم الهاتف مسجل بالفعل لحساب آخر." });
      }

      const token = crypto.randomBytes(32).toString("hex");
      const newUser = {
        id: crypto.randomUUID(),
        name,
        email: cleanEmail,
        password,
        role: "PATIENT",
        isVerified: false,
        verificationToken: token,
        verificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      };
      users.push(newUser);
      writeLocalJsonDb("users", users);

      if (existingPatientWithPhone) {
        existingPatientWithPhone.password = password;
        existingPatientWithPhone.email = cleanEmail;
        existingPatientWithPhone.name = name;
      } else {
        patients.push({
          id: crypto.randomUUID(),
          name,
          phone: cleanPhone,
          email: cleanEmail,
          password,
          medicalConditions: [],
          allergies: [],
          isActive: true,
          totalSpent: 0,
          outstandingBalance: 0
        });
      }
      writeLocalJsonDb("patients", patients);

      await sendVerificationEmail(cleanEmail, name, token);
      return res.json({ success: true, message: "تم إنشاء الحساب بنجاح. يرجى تفعيله من بريدك الإلكتروني." });
    }
  } catch (err) {
    console.error("Registration failed:", err);
    return res.status(500).json({ error: "حدث خطأ أثناء إنشاء الحساب." });
  }
});

app.get("/verify-email", async (req, res) => {
  const { token } = req.query;
  if (!token || typeof token !== "string") {
    return res.status(400).send("<h1>رابط التفعيل غير صالح. Invalid token.</h1>");
  }

  try {
    if (prisma) {
      const user = await prisma.user.findUnique({
        where: { verificationToken: token }
      });

      if (!user) {
        return res.status(400).send("<h1>رابط التفعيل غير صالح أو منتهي الصلاحية. Token not found.</h1>");
      }

      const now = new Date();
      if (user.verificationExpires && now > user.verificationExpires) {
        return res.status(400).send("<h1>انتهت صلاحية رابط التفعيل. Token expired.</h1>");
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          isVerified: true,
          verificationToken: null,
          verificationExpires: null
        }
      });

      const appUrl = process.env.APP_URL || "http://localhost:3000";
      return res.redirect(`${appUrl}?emailVerified=success`);
    } else {
      const local = readLocalJsonDb();
      const users = local.users || [];
      const user = users.find((u: any) => u.verificationToken === token);

      if (!user) {
        return res.status(400).send("<h1>رابط التفعيل غير صالح. Token not found.</h1>");
      }

      const now = new Date();
      if (user.verificationExpires && now > new Date(user.verificationExpires)) {
        return res.status(400).send("<h1>انتهت صلاحية رابط التفعيل. Token expired.</h1>");
      }

      user.isVerified = true;
      user.verificationToken = null;
      user.verificationExpires = null;
      writeLocalJsonDb("users", users);

      const appUrl = process.env.APP_URL || "http://localhost:3000";
      return res.redirect(`${appUrl}?emailVerified=success`);
    }
  } catch (err) {
    console.error("Email verification failed:", err);
    return res.status(500).send("<h1>حدث خطأ أثناء تفعيل الحساب. Verification error.</h1>");
  }
});

// In-memory store for tracking failed admin passcode attempts to prevent brute force
const passcodeFailureStore = new Map<string, { count: number; lockTime?: number }>();

// JWT Login and Session Endpoints
app.post("/api/auth/login", rateLimiter(10, 60 * 1000), async (req, res) => {
  const { emailOrPhone, password, passcode } = req.body;
  try {
    let userId = "";
    let userName = "";
    let userRole = "";
    let userEmail = "";

    let matchedUser: any = null;
    let matchedPatient: any = null;

    if (passcode) {
      const nowMs = Date.now();
      // 1. Account/Kiosk lockout check
      const lockoutRecord = passcodeFailureStore.get("global_lockout");
      if (lockoutRecord && lockoutRecord.lockTime && nowMs < lockoutRecord.lockTime) {
        return res.status(429).json({
          error: "تم قفل بوابة رمز المرور مؤقتاً بسبب محاولات خاطئة متكررة. يرجى الانتظار 15 دقيقة.",
          retryAfter: Math.ceil((lockoutRecord.lockTime - nowMs) / 1000)
        });
      }

      // 2. Decoupled PIN verification against CLINIC_PASSCODE (Default: 2026)
      const expectedPasscode = process.env.CLINIC_PASSCODE || "2026";
      if (passcode === expectedPasscode) {
        // Clear lockout on success
        passcodeFailureStore.delete("global_lockout");

        if (prisma) {
          // Log in as the default administrator account
          matchedUser = await prisma.user.findFirst({
            where: { email: "admin@clinic.com" }
          });
          if (!matchedUser) {
            // Fallback to first ADMIN user if admin@clinic.com is missing
            matchedUser = await prisma.user.findFirst({
              where: { role: "ADMIN" }
            });
          }
        } else {
          // Safe JSON DB mode fallback (non-production only)
          userId = "admin-fallback";
          userName = "Clinic Administrator";
          userRole = "ADMIN";
          userEmail = "admin@clinic.com";
          matchedUser = { id: userId, name: userName, role: userRole, email: userEmail };
        }
      } else {
        // Increment failures
        const record = passcodeFailureStore.get("global_lockout") || { count: 0 };
        record.count++;
        if (record.count >= 5) {
          record.lockTime = nowMs + 15 * 60 * 1000; // 15 mins lockout
        }
        passcodeFailureStore.set("global_lockout", record);

        await createAuditLog("LOGIN", "FAILURE", null, "admin-passcode", req, `Invalid passcode attempt (attempt ${record.count})`);
        return res.status(401).json({ error: "Invalid admin passcode" });
      }
    } else if (emailOrPhone) {
      const cleanInput = emailOrPhone.trim().toLowerCase();
      if (prisma) {
        // Check User table (Staff, Admin, Doctors, Receptionists, and Patients with User accounts)
        let user = await prisma.user.findFirst({
          where: { email: cleanInput }
        });

        if (user && bcrypt.compareSync(password, user.password)) {
          matchedUser = user;
          // If the user has a patient record, link it
          const patient = await prisma.patient.findFirst({ where: { userId: user.id } });
          if (patient) matchedPatient = patient;
        } else {
          // Check Patient table by phone or email
          const patient = await prisma.patient.findFirst({
            where: {
              OR: [
                { email: cleanInput },
                { phone: emailOrPhone.trim() }
              ]
            },
            include: { user: true }
          });

          if (patient) {
            if (patient.user) {
              if (bcrypt.compareSync(password, patient.user.password)) {
                matchedUser = patient.user;
                matchedPatient = patient;
              }
            }
          }
        }
      } else {
        // Fallback file-json check
        const local = readLocalJsonDb();
        const users = local.users || [];
        const user = users.find((u: any) => u.email === cleanInput);
        if (user) {
          if (password && password === user.password) {
            if (!user.isVerified) {
              return res.status(403).json({ error: "برجاء تفعيل حسابك من خلال الرابط المرسل لبريدك الإلكتروني أولاً. Please verify your email first." });
            }
            matchedUser = user;
          }
        } else {
          const patient = (local.patients || []).find((p: any) => 
            p.email?.toLowerCase() === cleanInput || p.phone === emailOrPhone.trim()
          );
          if (patient) {
            if (password && password === patient.password && password !== "123" && password !== "2026") {
              matchedPatient = patient;
            }
          }
        }
      }
    } else {
      return res.status(400).json({ error: "Email/phone or passcode is required" });
    }

    if (matchedUser) {
      if (matchedUser.role === "PATIENT" && !matchedUser.isVerified) {
        return res.status(403).json({ error: "برجاء تفعيل حسابك من خلال الرابط المرسل لبريدك الإلكتروني أولاً. Please verify your email first." });
      }
      userId = matchedUser.id;
      userName = matchedUser.name;
      userRole = matchedUser.role.toUpperCase();
      userEmail = matchedUser.email;
    } else if (matchedPatient) {
      userId = matchedPatient.id;
      userName = matchedPatient.name;
      userRole = "PATIENT";
      userEmail = matchedPatient.email || "";
    } else {
      await createAuditLog("LOGIN", "FAILURE", null, emailOrPhone || "passcode", req, "Invalid login credentials");
      return res.status(401).json({ error: "Invalid email/phone or password" });
    }

    // Generate secure Access Token (15 minutes) and Refresh Token (7 days)
    const accessToken = jwt.sign(
      { id: userId, role: userRole, email: userEmail },
      JWT_SECRET,
      { expiresIn: "15m" }
    );

    const refreshTokenRaw = jwt.sign(
      { id: userId, role: userRole },
      JWT_REFRESH_SECRET,
      { expiresIn: "7d" }
    );

    // Store hashed refresh token in database (SHA-256) if prisma is enabled
    if (prisma) {
      const tokenHash = hashToken(refreshTokenRaw);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await prisma.refreshToken.create({
        data: {
          userId: matchedUser ? matchedUser.id : null,
          patientId: matchedPatient ? matchedPatient.id : null,
          tokenHash,
          expiresAt,
        }
      });
    }

    // Write HTTP-only cookies
    res.cookie("accessToken", accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 15 * 60 * 1000
    });

    res.cookie("refreshToken", refreshTokenRaw, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    await createAuditLog("LOGIN", "SUCCESS", userId, userEmail, req, `Logged in successfully as ${userRole}`);

    return res.json({
      success: true,
      token: accessToken,
      refreshToken: refreshTokenRaw,
      user: {
        id: userId,
        name: userName,
        role: userRole,
        email: userEmail
      }
    });
  } catch (err) {
    console.error("Auth login failure:", err);
    return res.status(500).json({ error: "Internal authentication error" });
  }
});

// GET currently logged-in user profile
app.get("/api/auth/me", authenticateToken, async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  try {
    let user: any = null;
    let patient: any = null;

    if (prisma) {
      user = await prisma.user.findUnique({
        where: { id: req.user.id }
      });
      if (!user) {
        patient = await prisma.patient.findUnique({
          where: { id: req.user.id }
        });
      }
    } else {
      // Fallback local file check
      const local = readLocalJsonDb();
      if (req.user.role === "ADMIN") {
        user = {
          id: req.user.id,
          name: "Clinic Administrator",
          role: "ADMIN",
          email: req.user.email || "admin@clinic.com"
        };
      } else {
        patient = (local.patients || []).find((p: any) => p.id === req.user.id);
      }
    }

    if (user) {
      return res.json({
        user: {
          id: user.id,
          name: user.name,
          role: user.role,
          email: user.email
        }
      });
    }
    if (patient) {
      return res.json({
        user: {
          id: patient.id,
          name: patient.name,
          role: "PATIENT",
          email: patient.email || ""
        }
      });
    }
    return res.status(404).json({ error: "User not found" });
  } catch (error) {
    console.error("Error in /api/auth/me:", error);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/auth/refresh", rateLimiter(30, 60 * 1000), async (req, res) => {
  const refreshTokenRaw = req.cookies?.refreshToken || req.cookies?.refresh_token || req.body?.refreshToken;

  if (!refreshTokenRaw) {
    return res.status(400).json({ error: "Refresh token is required" });
  }

  try {
    if (prisma) {
      const incomingHash = hashToken(refreshTokenRaw);
      const tokenRecord = await prisma.refreshToken.findUnique({
        where: { tokenHash: incomingHash }
      });

      if (!tokenRecord) {
        return res.status(401).json({ error: "Invalid or unknown refresh token" });
      }

      // Check for Refresh Token Reuse
      if (tokenRecord.revokedAt) {
        console.warn(`[SECURITY ALERT] Refresh token reuse detected for userId: ${tokenRecord.userId || tokenRecord.patientId}`);
        
        // Immediately revoke every active session belonging to that identity
        if (tokenRecord.userId) {
          await prisma.refreshToken.updateMany({
            where: { userId: tokenRecord.userId },
            data: { revokedAt: new Date() }
          });
        } else if (tokenRecord.patientId) {
          await prisma.refreshToken.updateMany({
            where: { patientId: tokenRecord.patientId },
            data: { revokedAt: new Date() }
          });
        }

        // Clear security cookies
        res.clearCookie("accessToken", { httpOnly: true, secure: true, sameSite: "none" });
        res.clearCookie("refreshToken", { httpOnly: true, secure: true, sameSite: "none" });

        await createAuditLog(
          "REFRESH_REUSE_DETECTED",
          "REVOKED",
          tokenRecord.userId || tokenRecord.patientId,
          null,
          req,
          "Attempted use of revoked refresh token. All active sessions have been invalidated."
        );

        return res.status(401).json({ error: "Security compromise detected. All sessions revoked. Please log in again." });
      }

      // Check for token expiration
      if (tokenRecord.expiresAt < new Date()) {
        return res.status(401).json({ error: "Expired refresh token" });
      }

      // Verify raw JWT
      jwt.verify(refreshTokenRaw, JWT_REFRESH_SECRET, { algorithms: ["HS256"] }, async (err: any, decoded: any) => {
        if (err) {
          return res.status(401).json({ error: "Invalid or corrupt refresh token" });
        }

        // Create new Access & Refresh tokens (Rotation)
        const newAccessToken = jwt.sign(
          { id: decoded.id, role: decoded.role, email: decoded.email },
          JWT_SECRET,
          { expiresIn: "15m" }
        );

        const newRefreshTokenRaw = jwt.sign(
          { id: decoded.id, role: decoded.role },
          JWT_REFRESH_SECRET,
          { expiresIn: "7d" }
        );

        const newHash = hashToken(newRefreshTokenRaw);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        // Revoke the old refresh token
        await prisma.refreshToken.update({
          where: { id: tokenRecord.id },
          data: { revokedAt: new Date() }
        });

        // Insert new rotated refresh token record
        await prisma.refreshToken.create({
          data: {
            userId: tokenRecord.userId,
            patientId: tokenRecord.patientId,
            tokenHash: newHash,
            expiresAt,
          }
        });

        // Write rotated HTTP-only cookies
        res.cookie("accessToken", newAccessToken, {
          httpOnly: true,
          secure: true,
          sameSite: "none",
          maxAge: 15 * 60 * 1000
        });

        res.cookie("refreshToken", newRefreshTokenRaw, {
          httpOnly: true,
          secure: true,
          sameSite: "none",
          maxAge: 7 * 24 * 60 * 60 * 1000
        });

        return res.json({ success: true, token: newAccessToken, refreshToken: newRefreshTokenRaw });
      });
    } else {
      // Bypassed/Fallback mode: just verify token and generate new ones
      jwt.verify(refreshTokenRaw, JWT_REFRESH_SECRET, { algorithms: ["HS256"] }, (err: any, decoded: any) => {
        if (err) {
          return res.status(401).json({ error: "Invalid or corrupt refresh token" });
        }

        const newAccessToken = jwt.sign(
          { id: decoded.id, role: decoded.role, email: decoded.email },
          JWT_SECRET,
          { expiresIn: "15m" }
        );

        const newRefreshTokenRaw = jwt.sign(
          { id: decoded.id, role: decoded.role },
          JWT_REFRESH_SECRET,
          { expiresIn: "7d" }
        );

        res.cookie("accessToken", newAccessToken, {
          httpOnly: true,
          secure: true,
          sameSite: "none",
          maxAge: 15 * 60 * 1000
        });

        res.cookie("refreshToken", newRefreshTokenRaw, {
          httpOnly: true,
          secure: true,
          sameSite: "none",
          maxAge: 7 * 24 * 60 * 60 * 1000
        });

        return res.json({ success: true, token: newAccessToken, refreshToken: newRefreshTokenRaw });
      });
    }

  } catch (err) {
    console.error("Auth refresh failure:", err);
    return res.status(500).json({ error: "Internal session refresh error" });
  }
});

app.post("/api/auth/logout", async (req, res) => {
  const refreshTokenRaw = req.cookies?.refreshToken || req.cookies?.refresh_token || req.body?.refreshToken;

  try {
    if (prisma && refreshTokenRaw) {
      const incomingHash = hashToken(refreshTokenRaw);
      const tokenRecord = await prisma.refreshToken.findUnique({
        where: { tokenHash: incomingHash }
      });

      if (tokenRecord) {
        await prisma.refreshToken.update({
          where: { id: tokenRecord.id },
          data: { revokedAt: new Date() }
        });

        await createAuditLog(
          "LOGOUT",
          "SUCCESS",
          tokenRecord.userId || tokenRecord.patientId,
          null,
          req,
          "Logged out current device successfully"
        );
      }
    }
  } catch (err) {
    console.warn("Prisma logout token revocation warning:", err);
  }

  // Clear HTTP-only cookies
  res.clearCookie("accessToken", { httpOnly: true, secure: true, sameSite: "none" });
  res.clearCookie("refreshToken", { httpOnly: true, secure: true, sameSite: "none" });

  return res.json({ success: true, message: "Logged out from current device successfully" });
});

app.post("/api/auth/logout-all", authenticateToken, async (req, res) => {
  const authUser = (req as AuthenticatedRequest).user;
  if (!authUser) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    if (prisma) {
      await prisma.refreshToken.updateMany({
        where: {
          OR: [
            { userId: authUser.id },
            { patientId: authUser.id }
          ]
        },
        data: { revokedAt: new Date() }
      });

      await createAuditLog(
        "LOGOUT_ALL_DEVICES",
        "SUCCESS",
        authUser.id,
        authUser.email || null,
        req,
        "Logged out from all devices successfully"
      );
    }
  } catch (err) {
    console.error("Prisma logout-all failed:", err);
  }

  // Clear HTTP-only cookies
  res.clearCookie("accessToken", { httpOnly: true, secure: true, sameSite: "none" });
  res.clearCookie("refreshToken", { httpOnly: true, secure: true, sameSite: "none" });

  return res.json({ success: true, message: "Logged out from all devices successfully" });
});

function findDoctorIdentifier(doctorInput: string): { nameKeyword: string, dbId: string } {
  const normalized = (doctorInput || "").toLowerCase();
  if (normalized.includes("عمرو") || normalized.includes("amr") || normalized.includes("doc-amr") || normalized.includes("dr-amr")) {
    return { nameKeyword: "Amr", dbId: "doc-amr" };
  }
  if (normalized.includes("باسل") || normalized.includes("basel") || normalized.includes("doc-basel") || normalized.includes("dr-basel")) {
    return { nameKeyword: "Basel", dbId: "doc-basel" };
  }
  return { nameKeyword: doctorInput, dbId: doctorInput };
}

// Public route to get booked slots for a given doctor and date
app.get("/api/public/booked-slots", async (req, res) => {
  const { doctor, date } = req.query;
  if (!date || typeof date !== "string") {
    return res.status(400).json({ error: "Date parameter is required" });
  }

  try {
    if (prisma) {
      let doctorIdFilter: string | undefined = undefined;
      if (doctor && typeof doctor === "string") {
        const docIdent = findDoctorIdentifier(doctor);
        const doc = await prisma.doctor.findFirst({
          where: {
            OR: [
              { id: docIdent.dbId },
              {
                user: {
                  name: {
                    contains: docIdent.nameKeyword,
                    mode: 'insensitive'
                  }
                }
              }
            ]
          }
        });
        if (doc) {
          doctorIdFilter = doc.id;
        }
      }

      const appointments = await prisma.appointment.findMany({
        where: {
          doctorId: doctorIdFilter,
          date: new Date(date),
          status: {
            not: AppointmentStatus.CANCELED
          }
        },
        select: {
          time: true
        }
      });

      return res.json({ bookedSlots: appointments.map(a => a.time) });
    } else {
      const local = readLocalJsonDb();
      const docIdent = doctor && typeof doctor === "string" ? findDoctorIdentifier(doctor) : null;
      const appointments = (local.appointments || []).filter((a: any) => {
        if (!docIdent) return a.date === date && a.status !== "Canceled" && a.status !== "CANCELED";
        const isMatchedDoc = a.doctorId === docIdent.dbId || 
                            a.doctorName.toLowerCase().includes(docIdent.nameKeyword.toLowerCase()) ||
                            a.doctorName.toLowerCase().includes((doctor as string).toLowerCase());
        return isMatchedDoc && a.date === date && a.status !== "Canceled" && a.status !== "CANCELED";
      });
      return res.json({ bookedSlots: appointments.map((a: any) => a.time) });
    }
  } catch (err) {
    console.error("Get booked slots failed:", err);
    return res.status(500).json({ error: "Failed to get booked slots" });
  }
});

function getServiceDetails(serviceName: string) {
  const norm = (serviceName || "").toLowerCase();
  if (norm.includes("implant") || norm.includes("زراعة") || norm.includes("زرع")) {
    return { visitTypeEnum: VisitType.TREATMENT, visitTypeStr: "Treatment", consultationFee: 12000, arabicName: "زراعة أسنان دقيقة" };
  } else if (norm.includes("whiten") || norm.includes("تبييض") || norm.includes("تبيض")) {
    return { visitTypeEnum: VisitType.TREATMENT, visitTypeStr: "Treatment", consultationFee: 3000, arabicName: "تبييض أسنان ليزر تجميلي" };
  } else if (norm.includes("ortho") || norm.includes("تقويم")) {
    return { visitTypeEnum: VisitType.TREATMENT, visitTypeStr: "Treatment", consultationFee: 15000, arabicName: "تقويم أسنان معدني / شفاف" };
  } else if (norm.includes("root") || norm.includes("عصب") || norm.includes("حشو")) {
    return { visitTypeEnum: VisitType.TREATMENT, visitTypeStr: "Treatment", consultationFee: 1500, arabicName: "علاج جذور وحشو عصب" };
  } else if (norm.includes("clean") || norm.includes("تنظيف") || norm.includes("جير")) {
    return { visitTypeEnum: VisitType.TREATMENT, visitTypeStr: "Treatment", consultationFee: 800, arabicName: "تنظيف الأسنان وإزالة الجير" };
  }
  // Default fallback for general consultation or unknown service
  return { visitTypeEnum: VisitType.CONSULTATION, visitTypeStr: "Consultation", consultationFee: 200, arabicName: serviceName || "كشف واستشارة طبية" };
}

// Public Booking Endpoint (Unauthenticated)
app.post("/api/public/book", rateLimiter(5, 60 * 1000), async (req, res) => {
  const schema = z.object({
    name: z.string(),
    phone: z.string(),
    email: z.string().email().nullable().optional(),
    password: z.string().nullable().optional(),
    service: z.string(),
    doctor: z.string(),
    date: z.string(),
    time: z.string(),
    notes: z.string().nullable().optional(),
  });

  const validation = schema.safeParse(req.body);
  if (!validation.success) {
    return res.status(400).json({ error: "Invalid booking request payload", details: validation.error.issues });
  }

  const { name, phone, email, password, service, doctor, date, time, notes } = validation.data;

  try {
    let patientId = "PAT-" + Math.floor(100000 + Math.random() * 900000);
    let apptId = "AZ-" + Math.floor(100000 + Math.random() * 900000);

    let finalPatient: any = null;
    let finalAppt: any = null;
    let generatedPassword = "";

    const serviceDetails = getServiceDetails(service);
    const appointmentNotes = notes 
      ? `${notes} - الخدمة المطلوبة: ${serviceDetails.arabicName}`
      : `طلب حجز خدمة: ${serviceDetails.arabicName} عبر الموقع الإلكتروني`;

    const docIdent = findDoctorIdentifier(doctor);

    if (prisma) {
      try {
        await prisma.$transaction(async (tx) => {
          // Find or create associated doctor first under 3NF
          const doctorRecord = await tx.doctor.findFirst({
            where: {
              OR: [
                { id: docIdent.dbId },
                {
                  user: {
                    name: {
                      contains: docIdent.nameKeyword,
                      mode: 'insensitive'
                    }
                  }
                }
              ]
            }
          });

          if (!doctorRecord) {
            throw new Error("DOCTOR_NOT_FOUND");
          }

          const doctorId = doctorRecord.id;

          // Double-booking protection: check for existing non-canceled appointments for this doctor at this date/time
          const duplicateAppt = await tx.appointment.findFirst({
            where: {
              doctorId,
              date: new Date(date),
              time,
              status: {
                not: AppointmentStatus.CANCELED
              }
            }
          });

          if (duplicateAppt) {
            throw new Error("DUPLICATE_APPOINTMENT");
          }

          // Check if patient already exists by phone
          let patient = await tx.patient.findFirst({
            where: { phone: phone.trim() },
            include: { user: true }
          });

          if (patient) {
            if (!patient.isActive) {
              throw new Error("INACTIVE_PATIENT");
            }
            patientId = patient.id;
            finalPatient = {
              id: patient.id,
              name: patient.name,
              phone: patient.phone,
              email: patient.email ? `${patient.email.slice(0, 2)}***@***.com` : null,
              bloodType: "Protected",
              isActive: patient.isActive,
              totalSpent: 0,
              outstandingBalance: 0,
              createdAt: patient.createdAt.toISOString()
            };
          } else {
            // Create new patient (anonymous guest)
            let userId: string | null = null;
            if (email) {
              generatedPassword = password || crypto.randomBytes(8).toString("hex");
              const user = await tx.user.create({
                data: {
                  name: name.trim(),
                  email: email.trim().toLowerCase(),
                  password: bcrypt.hashSync(generatedPassword, 12),
                  role: UserRole.PATIENT,
                  isVerified: true
                }
              });
              userId = user.id;
            }

            const newPatient = await tx.patient.create({
              data: {
                id: patientId,
                userId,
                name: name.trim(),
                phone: phone.trim(),
                email: email || null,
                bloodType: "O+",
                isActive: true,
                totalSpent: 0,
                outstandingBalance: 0
              }
            });

            finalPatient = {
              id: newPatient.id,
              name: newPatient.name,
              phone: newPatient.phone,
              email: newPatient.email,
              bloodType: newPatient.bloodType,
              isActive: newPatient.isActive,
              totalSpent: Number(newPatient.totalSpent || 0),
              outstandingBalance: Number(newPatient.outstandingBalance || 0),
              createdAt: newPatient.createdAt.toISOString()
            };
          }

          // Create appointment
          const newAppt = await tx.appointment.create({
            data: {
              id: apptId,
              patientId,
              doctorId,
              date: new Date(date),
              time,
              duration: 30,
              visitType: serviceDetails.visitTypeEnum,
              chairId: "Chair 1",
              consultationFee: serviceDetails.consultationFee,
              paymentMethod: PaymentMethod.CASH,
              status: AppointmentStatus.SCHEDULED,
              notes: appointmentNotes,
              isOnline: true
            },
            include: {
              doctor: {
                include: { user: true }
              }
            }
          });

          finalAppt = {
            id: newAppt.id,
            patientId: newAppt.patientId,
            patientName: name.trim(),
            patientPhone: phone.trim(),
            doctorName: newAppt.doctor?.user?.name || doctor,
            doctorEmail: newAppt.doctor?.user?.email || "amr.eladawy@gmail.com",
            date: newAppt.date.toISOString().slice(0, 10),
            time: newAppt.time,
            duration: newAppt.duration,
            visitType: serviceDetails.visitTypeStr,
            chairId: newAppt.chairId,
            consultationFee: Number(newAppt.consultationFee || 0),
            paymentMethod: "Cash",
            status: "Scheduled",
            notes: newAppt.notes || "حجز عبر الموقع الإلكتروني",
            isOnline: true,
            createdAt: newAppt.createdAt.toISOString()
          };
        }, {
          isolationLevel: "Serializable"
        });
      } catch (txnErr: any) {
        // Re-throw to main try-catch where we handle specific errors
        throw txnErr;
      }
    } else {
      // Offline fallback write to db.json
      const local = readLocalJsonDb();
      if (!local.patients) local.patients = [];
      if (!local.appointments) local.appointments = [];

      // Find doctor record
      const matchedDoctor = (local.doctors || []).find((d: any) => 
        d.id === docIdent.dbId || d.name.toLowerCase().includes(docIdent.nameKeyword.toLowerCase()) || d.name.toLowerCase().includes(doctor.toLowerCase())
      );
      if (!matchedDoctor) {
        return res.status(404).json({ error: `الطبيب المطلوب غير متوفر حالياً. The requested doctor (${doctor}) is not available.` });
      }

      const doctorId = matchedDoctor.id;
      const doctorName = matchedDoctor.name;

      // Double-booking check in fallback
      const duplicateAppt = local.appointments.find((a: any) => 
        (a.doctorId === doctorId || a.doctorName === doctorName) && 
        a.date === date && 
        a.time === time && 
        a.status !== "Canceled" && 
        a.status !== "CANCELED"
      );

      if (duplicateAppt) {
        return res.status(409).json({ error: "هذا الموعد محجوز بالفعل للطبيب المختار. This slot is already booked for this doctor." });
      }

      let patient = local.patients.find((p: any) => p.phone === phone.trim());
      if (patient) {
        if (patient.isActive === false) {
          return res.status(403).json({ error: "عذراً، هذا الحساب غير نشط حالياً ولا يمكن حجز مواعيد له. This account is inactive." });
        }
        patientId = patient.id;
        finalPatient = {
          id: patient.id,
          name: patient.name,
          phone: patient.phone,
          email: patient.email ? `${patient.email.slice(0, 2)}***@***.com` : null,
          bloodType: "Protected",
          isActive: patient.isActive,
          totalSpent: 0,
          outstandingBalance: 0,
          createdAt: patient.createdAt || new Date().toISOString()
        };
      } else {
        finalPatient = {
          id: patientId,
          name: name.trim(),
          phone: phone.trim(),
          email: email || null,
          bloodType: "O+",
          isActive: true,
          totalSpent: 0,
          outstandingBalance: 0,
          createdAt: new Date().toISOString()
        };
        local.patients.push(finalPatient);
      }

      finalAppt = {
        id: apptId,
        patientId,
        patientName: name.trim(),
        patientPhone: phone.trim(),
        doctorId,
        doctorName,
        doctorEmail: matchedDoctor.email || "amr.eladawy@gmail.com",
        date,
        time,
        duration: 30,
        visitType: serviceDetails.visitTypeStr,
        chairId: "Chair 1",
        consultationFee: serviceDetails.consultationFee,
        paymentMethod: "Cash",
        status: "Scheduled",
        notes: appointmentNotes,
        isOnline: true,
        createdAt: new Date().toISOString()
      };
      local.appointments.push(finalAppt);
      writeLocalJsonDb("patients", local.patients);
      writeLocalJsonDb("appointments", local.appointments);
    }

    return res.json({
      success: true,
      patient: finalPatient,
      appointment: finalAppt,
      generatedPassword: generatedPassword || undefined
    });
  } catch (err: any) {
    console.error("Public booking failed:", err);
    if (err.message === "DOCTOR_NOT_FOUND") {
      return res.status(404).json({ error: `الطبيب المطلوب غير متوفر حالياً. The requested doctor (${doctor}) is not available.` });
    }
    if (err.message === "DUPLICATE_APPOINTMENT") {
      return res.status(409).json({ error: "هذا الموعد محجوز بالفعل للطبيب المختار. يرجى اختيار وقت آخر أو طبيب آخر. This slot is already booked for this doctor." });
    }
    if (err.message === "INACTIVE_PATIENT") {
      return res.status(403).json({ error: "عذراً، هذا الحساب غير نشط حالياً ولا يمكن حجز مواعيد له. This account is inactive and cannot book appointments." });
    }
    return res.status(500).json({ error: "Failed to process public booking" });
  }
});

// Explicit DELETE Endpoints
app.delete("/api/patients/:id", authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN", "DOCTOR"]), async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    if (prisma) {
      await prisma.$transaction(async (tx) => {
        await tx.appointment.deleteMany({ where: { patientId: id } });
        await tx.treatment.deleteMany({ where: { patientId: id } });
        await tx.invoice.deleteMany({ where: { patientId: id } });
        await tx.dentalChart.deleteMany({ where: { patientId: id } });
        await tx.patient.delete({ where: { id } });
      });
    } else {
      const local = readLocalJsonDb();
      local.patients = (local.patients || []).filter((p: any) => p.id !== id);
      writeLocalJsonDb("patients", local.patients);
    }
    await createAuditLog("DELETE_RECORD", "SUCCESS", req.user?.id || null, req.user?.email || null, req, `Deleted patient ${id}`);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete patient failed:", err);
    res.status(500).json({ error: "Failed to delete patient" });
  }
});

app.delete("/api/appointments/:id", authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN", "DOCTOR", "RECEPTIONIST"]), async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    const lockedMonths = await getLockedMonthsList();
    if (prisma) {
      const record = await prisma.appointment.findUnique({ where: { id } });
      if (record) {
        const month = record.date.toISOString().slice(0, 7);
        if (lockedMonths.includes(month)) {
          return res.status(403).json({ error: "Cannot delete an appointment in a locked month." });
        }
      }
      await prisma.$transaction(async (tx) => {
        await tx.invoice.deleteMany({ where: { appointmentId: id } });
        await tx.appointment.delete({ where: { id } });
      });
    } else {
      const local = readLocalJsonDb();
      const record = (local.appointments || []).find((a: any) => a.id === id);
      if (record) {
        const month = record.date.slice(0, 7);
        if (lockedMonths.includes(month)) {
          return res.status(403).json({ error: "Cannot delete an appointment in a locked month." });
        }
      }
      local.appointments = (local.appointments || []).filter((a: any) => a.id !== id);
      writeLocalJsonDb("appointments", local.appointments);
    }
    await createAuditLog("DELETE_RECORD", "SUCCESS", req.user?.id || null, req.user?.email || null, req, `Deleted appointment ${id}`);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete appointment failed:", err);
    res.status(500).json({ error: "Failed to delete appointment" });
  }
});

app.delete("/api/treatments/:id", authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN", "DOCTOR"]), async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    if (prisma) {
      await prisma.$transaction(async (tx) => {
        await tx.treatmentSession.deleteMany({ where: { treatmentId: id } });
        await tx.treatment.delete({ where: { id } });
      });
    } else {
      const local = readLocalJsonDb();
      local.treatments = (local.treatments || []).filter((t: any) => t.id !== id);
      writeLocalJsonDb("treatments", local.treatments);
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Delete treatment failed:", err);
    res.status(500).json({ error: "Failed to delete treatment" });
  }
});

app.delete("/api/invoices/:id", authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN", "DOCTOR"]), async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    const lockedMonths = await getLockedMonthsList();
    if (prisma) {
      const record = await prisma.invoice.findUnique({ where: { id } });
      if (record) {
        const month = record.date.toISOString().slice(0, 7);
        if (lockedMonths.includes(month)) {
          return res.status(403).json({ error: "Cannot delete an invoice in a locked month." });
        }
      }
      await prisma.$transaction(async (tx) => {
        await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
        await tx.payment.deleteMany({ where: { invoiceId: id } });
        await tx.invoice.delete({ where: { id } });
      });
    } else {
      const local = readLocalJsonDb();
      const record = (local.invoices || []).find((i: any) => i.id === id);
      if (record) {
        const month = record.date.slice(0, 7);
        if (lockedMonths.includes(month)) {
          return res.status(403).json({ error: "Cannot delete an invoice in a locked month." });
        }
      }
      local.invoices = (local.invoices || []).filter((i: any) => i.id !== id);
      writeLocalJsonDb("invoices", local.invoices);
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Delete invoice failed:", err);
    res.status(500).json({ error: "Failed to delete invoice" });
  }
});

app.delete("/api/expenses/:id", authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN", "DOCTOR"]), async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    const lockedMonths = await getLockedMonthsList();
    if (prisma) {
      const record = await prisma.expense.findUnique({ where: { id } });
      if (record) {
        const month = record.date.toISOString().slice(0, 7);
        if (lockedMonths.includes(month)) {
          return res.status(403).json({ error: "Cannot delete an expense in a locked month." });
        }
      }
      await prisma.expense.delete({ where: { id } });
    } else {
      const local = readLocalJsonDb();
      const record = (local.expenses || []).find((e: any) => e.id === id);
      if (record) {
        const month = record.date.slice(0, 7);
        if (lockedMonths.includes(month)) {
          return res.status(403).json({ error: "Cannot delete an expense in a locked month." });
        }
      }
      local.expenses = (local.expenses || []).filter((e: any) => e.id !== id);
      writeLocalJsonDb("expenses", local.expenses);
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Delete expense failed:", err);
    res.status(500).json({ error: "Failed to delete expense" });
  }
});

app.delete("/api/inventory/:id", authenticateToken, requireRole(["SUPER_ADMIN", "ADMIN", "DOCTOR"]), async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    if (prisma) {
      await prisma.inventory.delete({ where: { id } });
    } else {
      const local = readLocalJsonDb();
      local.inventory = (local.inventory || []).filter((i: any) => i.id !== id);
      writeLocalJsonDb("inventory", local.inventory);
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Delete inventory failed:", err);
    res.status(500).json({ error: "Failed to delete inventory" });
  }
});

app.delete("/api/notifications/:id", authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  try {
    if (prisma) {
      const notification = await prisma.notification.findUnique({ where: { id } });
      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }

      if (req.user?.role === "PATIENT") {
        const patient = await prisma.patient.findFirst({
          where: { OR: [{ id: req.user.id }, { userId: req.user.id }] }
        });
        const ownId = patient ? patient.id : req.user.id;
        if (notification.patientId !== ownId) {
          return res.status(403).json({ error: "Forbidden: Patients can only delete their own notifications." });
        }
      }

      await prisma.notification.delete({ where: { id } });
    } else {
      const local = readLocalJsonDb();
      const notification = (local.notifications || []).find((n: any) => n.id === id);
      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }

      if (req.user?.role === "PATIENT") {
        if (notification.patientId && notification.patientId !== req.user.id) {
          return res.status(403).json({ error: "Forbidden: Patients can only delete their own notifications." });
        }
      }

      local.notifications = (local.notifications || []).filter((n: any) => n.id !== id);
      writeLocalJsonDb("notifications", local.notifications);
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Delete notification failed:", err);
    res.status(500).json({ error: "Failed to delete notification" });
  }
});

// Root API Health Check
app.get("/api/health", async (req, res) => {
  let dbStatus = "ok";
  if (prisma) {
    try {
      // Fast check with a 3 second timeout
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => setTimeout(() => reject(new Error("Database ping timeout")), 3000))
      ]);
    } catch (err) {
      dbStatus = "error";
      console.error("Health check: Database is unreachable:", err);
      return res.status(503).json({
        status: "error",
        database: "unreachable",
        error: String(err)
      });
    }
  }
  res.json({
    status: "ok",
    database: prisma ? "postgresql" : "file-json",
    databaseConnection: prisma ? dbStatus : "n/a",
    prismaEnabled: !!prisma
  });
});

// Start Server Setup and Vite Integration
async function startServer() {
  // Run seeding if using PostgreSQL Prisma with a safe 15s timeout
  if (prisma) {
    try {
      await Promise.race([
        seedDatabaseIfEmpty(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Database seeding timed out after 15 seconds")), 15000))
      ]);
    } catch (seedErr) {
      console.error("⚠️ Database seeding failed or timed out:", seedErr);
      console.log("Proceeding with server startup...");
    }
  } else {
    initLocalJsonDb();
  }

  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Clinic Relational Full-Stack Server running on port ${PORT}`);
  });
}

startServer();