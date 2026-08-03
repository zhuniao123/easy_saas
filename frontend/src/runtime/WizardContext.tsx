import { createContext, useContext, type ReactNode } from 'react';

export interface WizardRuntime {
  state: Record<string, unknown>;
  setField: (key: string, value: unknown) => void;
  setFields: (patch: Record<string, unknown>) => void;
}

const WizardRuntimeContext = createContext<WizardRuntime | null>(null);

export function WizardRuntimeProvider({
  value,
  children,
}: {
  value: WizardRuntime;
  children: ReactNode;
}) {
  return <WizardRuntimeContext.Provider value={value}>{children}</WizardRuntimeContext.Provider>;
}

export function useWizardRuntime(): WizardRuntime | null {
  return useContext(WizardRuntimeContext);
}
