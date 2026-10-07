/// <reference types="vite/client" />

declare module '@assets/*' {
  const value: string;
  export default value;
}

declare module '*.jpeg' {
  const value: string;
  export default value;
}

declare module '*.jpg' {
  const value: string;
  export default value;
}

declare module '*.png' {
  const value: string;
  export default value;
}

declare module '*.webp' {
  const value: string;
  export default value;
}

declare module '@cashfreepayments/cashfree-js' {
  interface CashfreeCheckoutOptions {
    paymentSessionId: string;
    redirectTarget?: '_self' | '_blank' | '_modal' | HTMLElement;
  }
  interface CashfreeCheckoutResult {
    error?: { message: string; [key: string]: any };
    redirect?: boolean;
    paymentDetails?: { paymentMessage?: string; [key: string]: any };
  }
  interface Cashfree {
    checkout: (options: CashfreeCheckoutOptions) => Promise<CashfreeCheckoutResult>;
  }
  export function load(options: { mode: 'sandbox' | 'production' }): Promise<Cashfree>;
}

