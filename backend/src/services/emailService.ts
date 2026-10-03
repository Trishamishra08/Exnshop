import nodemailer from "nodemailer";

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true", // false for port 587
    auth: {
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
    },
  });
}

export interface ISupportEmailPayload {
  name: string;
  email: string;
  subject: string;
  message: string;
  customerId?: string;
  submittedAt?: Date;
}

export async function sendSupportEmail(payload: ISupportEmailPayload): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const transporter = getTransporter();

    const mailOptions = {
      from: `"${process.env.MAIL_FROM_NAME || 'Exnshop'}" <${process.env.MAIL_FROM || process.env.SMTP_USER}>`,
      to: process.env.SUPPORT_EMAIL || process.env.SMTP_USER,
      replyTo: payload.email,
      subject: `[Exnshop Support] ${payload.subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #16a34a; color: #ffffff; padding: 16px 24px;">
            <h2 style="margin: 0; font-size: 20px;">Exnshop</h2>
            <p style="margin: 4px 0 0 0; font-size: 14px; opacity: 0.9;">Customer Support Request</p>
          </div>
          <div style="padding: 24px; background-color: #ffffff;">
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px; width: 140px; font-weight: bold;">Customer Name:</td>
                <td style="padding: 8px 0; color: #111; font-size: 14px;">${escapeHtml(payload.name)}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px; font-weight: bold;">Customer Email:</td>
                <td style="padding: 8px 0; color: #111; font-size: 14px;"><a href="mailto:${escapeHtml(payload.email)}" style="color: #2563eb; text-decoration: none;">${escapeHtml(payload.email)}</a></td>
              </tr>
              ${payload.customerId ? `
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px; font-weight: bold;">Customer ID:</td>
                <td style="padding: 8px 0; color: #111; font-size: 14px; font-family: monospace;">${escapeHtml(payload.customerId)}</td>
              </tr>` : ''}
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px; font-weight: bold;">Subject:</td>
                <td style="padding: 8px 0; color: #111; font-size: 14px; font-weight: bold;">${escapeHtml(payload.subject)}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px; font-weight: bold;">Submitted At:</td>
                <td style="padding: 8px 0; color: #111; font-size: 14px;">${(payload.submittedAt || new Date()).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</td>
              </tr>
            </table>

            <div style="border-top: 1px solid #eee; margin-top: 16px; padding-top: 16px;">
              <h4 style="margin: 0 0 8px 0; color: #444; font-size: 14px;">Message:</h4>
              <div style="background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; color: #1f2937;">
${escapeHtml(payload.message)}
              </div>
            </div>
          </div>
          <div style="background-color: #f3f4f6; color: #6b7280; padding: 12px 24px; font-size: 12px; text-align: center; border-top: 1px solid #e5e7eb;">
            This message was submitted through the Exnshop customer application support form.
          </div>
        </div>
      `,
      text: `
Exnshop - Customer Support Request
------------------------------------------------
Customer Name: ${payload.name}
Customer Email: ${payload.email}
${payload.customerId ? `Customer ID: ${payload.customerId}\n` : ''}
Subject: ${payload.subject}
Submitted At: ${(payload.submittedAt || new Date()).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}

Message:
${payload.message}

------------------------------------------------
This message was submitted through the Exnshop customer application.
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[EMAIL SERVICE] Support email sent successfully. Message ID: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error("[EMAIL SERVICE ERROR] Failed to send support email:", error);
    return { success: false, error: error.message || "Failed to send email" };
  }
}

/**
 * Send a 6-digit email verification code — used for Seller (and reusable for
 * any user type later) email verification during Phase 1 profile setup.
 */
export async function sendVerificationCodeEmail(
  toEmail: string,
  recipientName: string,
  code: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const transporter = getTransporter();

    const mailOptions = {
      from: `"${process.env.MAIL_FROM_NAME || "Exnshop"}" <${process.env.MAIL_FROM || process.env.SMTP_USER}>`,
      to: toEmail,
      subject: "Verify your email address",
      html: `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 480px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #0d9488; color: #ffffff; padding: 16px 24px;">
            <h2 style="margin: 0; font-size: 20px;">Exnshop</h2>
          </div>
          <div style="padding: 24px; background-color: #ffffff;">
            <p style="font-size: 14px; color: #333;">Hi ${escapeHtml(recipientName)},</p>
            <p style="font-size: 14px; color: #333;">Use the code below to verify your email address. It expires in 10 minutes.</p>
            <div style="text-align: center; margin: 24px 0;">
              <span style="display: inline-block; font-size: 28px; font-weight: bold; letter-spacing: 8px; color: #0d9488; background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px; padding: 12px 24px;">${code}</span>
            </div>
            <p style="font-size: 12px; color: #888;">If you didn't request this, you can safely ignore this email.</p>
          </div>
        </div>
      `,
      text: `Your Exnshop email verification code is: ${code} (expires in 10 minutes)`,
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error("[EMAIL SERVICE ERROR] Failed to send verification email:", error);
    return { success: false, error: error.message || "Failed to send email" };
  }
}

export type OtpUserType = "Customer" | "Seller" | "Delivery" | "Admin";
export type OtpPurpose = "login" | "register";

const OTP_EMAIL_COPY: Record<OtpUserType, Record<OtpPurpose, { subject: string; heading: string; intro: string }>> = {
  Customer: {
    register: {
      subject: "Welcome to Exnshop — verify your email",
      heading: "Welcome to Exnshop!",
      intro: "Use the code below to verify your email and finish creating your account.",
    },
    login: {
      subject: "Your Exnshop login code",
      heading: "Exnshop",
      intro: "Use the code below to log in to your Exnshop account.",
    },
  },
  Seller: {
    register: {
      subject: "Welcome to Exnshop Seller Portal — verify your email",
      heading: "Exnshop Seller Portal",
      intro: "Thanks for registering as a seller on Exnshop! Use the code below to verify your email and activate your account.",
    },
    login: {
      subject: "Your Exnshop Seller login code",
      heading: "Exnshop Seller Portal",
      intro: "Use the code below to log in to your Exnshop Seller account.",
    },
  },
  Delivery: {
    register: {
      subject: "Welcome to Exnshop Delivery Partners — verify your email",
      heading: "Exnshop Delivery Partners",
      intro: "Thanks for registering as a delivery partner! Use the code below to verify your email and activate your account.",
    },
    login: {
      subject: "Your Exnshop Delivery Partner login code",
      heading: "Exnshop Delivery Partners",
      intro: "Use the code below to log in to your Exnshop Delivery Partner account.",
    },
  },
  Admin: {
    register: {
      subject: "Welcome to Exnshop Admin — verify your email",
      heading: "Exnshop Admin",
      intro: "Use the code below to verify your email and activate your account.",
    },
    login: {
      subject: "Your Exnshop Admin login code",
      heading: "Exnshop Admin",
      intro: "Use the code below to log in to your Exnshop Admin account.",
    },
  },
};

/**
 * Send a 6-digit login/registration OTP, with the subject line and wording
 * tailored to which panel (Customer/Seller/Delivery/Admin) and which moment
 * (first-time registration vs a regular login) it's for.
 */
export async function sendOtpEmail(
  toEmail: string,
  recipientName: string,
  code: string,
  userType: OtpUserType,
  purpose: OtpPurpose
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const transporter = getTransporter();
    const copy = OTP_EMAIL_COPY[userType]?.[purpose] || OTP_EMAIL_COPY.Customer[purpose] || OTP_EMAIL_COPY.Customer.login;

    const mailOptions = {
      from: `"${process.env.MAIL_FROM_NAME || "Exnshop"}" <${process.env.MAIL_FROM || process.env.SMTP_USER}>`,
      to: toEmail,
      subject: copy.subject,
      html: `
        <div style="font-family: Arial, sans-serif; color: #333; max-width: 480px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #0d9488; color: #ffffff; padding: 16px 24px;">
            <h2 style="margin: 0; font-size: 20px;">${escapeHtml(copy.heading)}</h2>
          </div>
          <div style="padding: 24px; background-color: #ffffff;">
            <p style="font-size: 14px; color: #333;">Hi ${escapeHtml(recipientName)},</p>
            <p style="font-size: 14px; color: #333;">${escapeHtml(copy.intro)} It expires in 10 minutes.</p>
            <div style="text-align: center; margin: 24px 0;">
              <span style="display: inline-block; font-size: 28px; font-weight: bold; letter-spacing: 8px; color: #0d9488; background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px; padding: 12px 24px;">${code}</span>
            </div>
            <p style="font-size: 12px; color: #888;">If you didn't request this, you can safely ignore this email.</p>
          </div>
        </div>
      `,
      text: `${copy.intro} Your code is: ${code} (expires in 10 minutes)`,
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error("[EMAIL SERVICE ERROR] Failed to send OTP email:", error);
    return { success: false, error: error.message || "Failed to send email" };
  }
}

function escapeHtml(text: string): string {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
