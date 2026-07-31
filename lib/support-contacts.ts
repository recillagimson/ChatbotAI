/**
 * SpeedSettr support contacts - the people a customer can call/text for help.
 * Single source of truth shared by the dashboard home "Need help?" card and the
 * sidebar Help button so the two can never drift. `tel` is E.164 for the tel:
 * href (dials/texts on mobile); `phone` is the human-readable display.
 */
export interface SupportContact {
  /** Display handle (rendered as "@name"). */
  name: string;
  /** Human-readable number for display. */
  phone: string;
  /** E.164 number for the `tel:` href. */
  tel: string;
}

export const SUPPORT_CONTACTS: SupportContact[] = [
  { name: "Gimson", phone: "+1 585-648-5732", tel: "+15856485732" },
  { name: "Arthur", phone: "+1 585-531-6251", tel: "+15855316251" },
];

/** Support availability window, shown alongside the contacts. */
export const SUPPORT_HOURS = "6 AM – 6 PM";
