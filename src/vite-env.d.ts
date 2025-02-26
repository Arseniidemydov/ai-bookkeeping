
/// <reference types="vite/client" />

interface PlaidHandler {
  open: () => void;
  exit: () => void;
}

interface PlaidConfig {
  token: string;
  onSuccess: (public_token: string) => void;
  onExit: () => void;
}

interface PlaidStatic {
  create: (config: PlaidConfig) => PlaidHandler;
}

interface Window {
  Plaid: PlaidStatic;
}
