/**
 * X/Twitter reads its own tag before falling back to og:image, so the card is
 * declared here too. Same artwork - re-exported rather than duplicated, so the
 * design only ever lives in one file.
 */
export { default, alt, size, contentType } from "./opengraph-image";
