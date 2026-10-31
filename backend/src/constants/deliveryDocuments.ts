/** KYC documents a delivery partner must upload. */
export const DELIVERY_DOCUMENT_TYPES = [
  "id_proof",
  "address_proof",
  "driving_license",
  "vehicle_photo",
  "vehicle_rc",
  "vehicle_puc",
  "vehicle_insurance",
  "bank_proof",
] as const;

export type DeliveryDocumentType = (typeof DELIVERY_DOCUMENT_TYPES)[number];

export const DELIVERY_DOCUMENT_INFO: Record<DeliveryDocumentType, { label: string; hint: string }> = {
  id_proof: { label: "ID proof", hint: "Aadhaar Card, Voter ID, Passport or any government-issued ID" },
  address_proof: { label: "Address proof", hint: "PAN Card, electricity bill or any government-issued ID" },
  driving_license: { label: "Driving licence", hint: "Valid driving licence" },
  vehicle_photo: { label: "Vehicle photo", hint: "Clear photo of your vehicle with the number plate visible" },
  vehicle_rc: { label: "Vehicle RC", hint: "Registration certificate of the vehicle" },
  vehicle_puc: { label: "Vehicle PUC", hint: "Valid pollution under control certificate" },
  vehicle_insurance: { label: "Vehicle insurance", hint: "Valid insurance policy of the vehicle" },
  bank_proof: { label: "Bank proof", hint: "Account statement or cancelled cheque" },
};
