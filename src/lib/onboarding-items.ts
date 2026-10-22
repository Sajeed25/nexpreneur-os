// Shared (client + server) definition of the member onboarding checklist.

export const ONBOARDING_ITEMS = [
  { id: "kyc", label: "ID proof (KYC) verified", hint: "Check a government ID and mark it verified." },
  { id: "agreement", label: "Membership agreement accepted", hint: "The member accepts the agreement online, or you record a signed copy." },
  { id: "deposit", label: "Security deposit paid", hint: "Raise a deposit invoice; this ticks itself when it is paid." },
  { id: "emergency", label: "Emergency contact on file", hint: "Ticks itself once the member adds one on their profile." },
] as const;
export type OnboardingItemId = (typeof ONBOARDING_ITEMS)[number]["id"];
export const itemLabel = (id: string) => ONBOARDING_ITEMS.find((i) => i.id === id)?.label ?? id;

export const DEFAULT_AGREEMENT = [
  "By becoming a member you agree to:",
  "1. Use the space, desks and rooms considerately and keep shared areas tidy.",
  "2. Pay membership fees and any charges for services on time.",
  "3. Not share your access with others or bring visitors without inviting them through the app.",
  "4. Follow the house rules shared by the community team, including quiet hours.",
  "5. Accept that the space may suspend access for non-payment or misuse of the premises.",
].join("\n");
