import type { Metadata } from "next";
import {
  LegalDoc,
  Section,
  P,
  CompanyContact,
} from "@/components/legal/legal-doc";

export const metadata: Metadata = {
  title: "Accessibility Statement | SpeedSettr",
  description:
    "Speedsettr LLC's commitment to digital accessibility and WCAG 2.1 Level AA standards.",
};

export default function AccessibilityPage() {
  return (
    <LegalDoc
      title="Accessibility Statement"
      updated="April 22, 2026"
      effective="April 22, 2026"
    >
      <P>
        Speedsettr LLC is committed to ensuring digital accessibility for people
        of all abilities. We are continually improving the user experience for
        everyone and applying the relevant accessibility standards.
      </P>

      <Section title="Our Commitment">
        <P>
          We strive to ensure that our website and digital services are accessible
          to individuals with disabilities in accordance with the Americans with
          Disabilities Act (ADA), Section 508 of the Rehabilitation Act, and the
          Web Content Accessibility Guidelines (WCAG) 2.1 Level AA standards where
          technically feasible.
        </P>
      </Section>

      <Section title="Measures We Take">
        <P>
          Speedsettr takes the following measures to ensure accessibility: we
          include accessibility as part of our internal development processes, we
          use semantic HTML and ARIA attributes where appropriate, we provide text
          alternatives for non-text content, we ensure sufficient color contrast
          for readability, we design for keyboard navigation and screen reader
          compatibility, and we regularly review our site for accessibility
          improvements.
        </P>
      </Section>

      <Section title="Known Limitations">
        <P>
          While we strive for full accessibility, some content may not yet be
          fully accessible. This may include certain third-party integrations or
          embedded content, some older video content that may lack captions or
          audio descriptions, and dynamically generated content from external
          platforms. We are actively working to address these limitations.
        </P>
      </Section>

      <Section title="Feedback and Assistance">
        <P>
          We welcome your feedback on the accessibility of our website. If you
          encounter any accessibility barriers or need assistance, please contact
          us at:
        </P>
        <CompanyContact />
        <P>
          We will make reasonable efforts to respond to your request within 5
          business days and to address any identified barriers.
        </P>
      </Section>

      <Section title="Third-Party Content">
        <P>
          Our website may contain links to or integrations with third-party
          websites and services. Speedsettr is not responsible for the
          accessibility of third-party content. We encourage our partners and
          vendors to maintain accessible digital experiences.
        </P>
      </Section>
    </LegalDoc>
  );
}
