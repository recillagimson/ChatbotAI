/**
 * Single source of truth for the company's public contact details.
 *
 * Used by the site footer and by the contact block at the end of every legal
 * document, so an address or phone change is a one-line edit here.
 */
export const COMPANY = {
  name: "Speedsettr LLC",
  address: "231 East 5th St New York 10003",
  email: "admin@speedsettr.com",
  phones: [
    { display: "+1 585-531-6251", tel: "+15855316251" },
    { display: "+1 585-648-5732", tel: "+15856485732" },
  ],
} as const;
