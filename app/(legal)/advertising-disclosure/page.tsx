import type { Metadata } from "next";
import {
  LegalDoc,
  Section,
  P,
  Lead,
  ExtLink,
  CompanyContact,
} from "@/components/legal/legal-doc";

export const metadata: Metadata = {
  title: "Advertising Disclosure | SpeedSettr",
  description:
    "How Speedsettr LLC discloses paid advertising, testimonials, results claims, and affiliate relationships under FTC guidelines.",
};

export default function AdvertisingDisclosurePage() {
  return (
    <LegalDoc
      title="Advertising Disclosure"
      updated="April 22, 2026"
      effective="April 22, 2026"
    >
      <P>
        This disclosure is provided in accordance with the Federal Trade
        Commission (FTC) guidelines on endorsements and advertising, as well as
        platform-specific advertising policies for Meta (Facebook, Instagram),
        Google (YouTube, Google Ads), TikTok, and other advertising networks.
      </P>

      <Section n={1} title="Paid Advertising">
        <P>
          Speedsettr LLC (&ldquo;Company,&rdquo; &ldquo;we,&rdquo;
          &ldquo;us&rdquo;) may use paid advertising on platforms including but
          not limited to Meta (Facebook, Instagram), Google (Search, Display,
          YouTube), TikTok, LinkedIn, and other digital advertising networks to
          promote our services. When you arrive at our website through a paid
          advertisement, you may see content that is consistent with the ad that
          brought you here. Our ads are clearly identified as sponsored content on
          all platforms in compliance with each platform&rsquo;s advertising
          policies.
        </P>
      </Section>

      <Section n={2} title="Testimonials and Endorsements">
        <P>
          Testimonials, reviews, and endorsements displayed on our website and in
          our marketing materials represent the honest opinions, findings,
          beliefs, or experiences of the individuals providing them. However,
          testimonials are not guarantees of future performance or results.
          Individual results will vary. Testimonial givers may have received
          services from Speedsettr but are not compensated for providing
          testimonials. Some testimonials may have been edited for clarity or
          length, but not for substance or meaning. Where required by FTC
          guidelines, material connections between endorsers and Speedsettr are
          disclosed.
        </P>
      </Section>

      <Section n={3} title="Income and Results Claims">
        <P>
          <Lead>IMPORTANT:</Lead> Any income figures, revenue numbers, or business
          results mentioned on this website, in advertisements, or in marketing
          materials are specific to the individuals or businesses referenced and
          are not typical. We make no guarantees that you will achieve similar
          results. Your results will depend on many factors including your skills,
          effort, market conditions, business model, and other circumstances
          beyond our control. All income claims comply with FTC Guides Concerning
          Use of Endorsements and Testimonials in Advertising (16 CFR Part 255).
        </P>
      </Section>

      <Section n={4} title="Affiliate Relationships">
        <P>
          Speedsettr may recommend or link to third-party products, services, or
          tools. In some cases, we may receive compensation (affiliate
          commissions, referral fees, or other consideration) if you purchase
          through our links. This does not affect the price you pay. We only
          recommend products and services we believe provide genuine value.
          Affiliate relationships do not influence our editorial content or
          service recommendations. All affiliate links are disclosed in compliance
          with FTC guidelines.
        </P>
      </Section>

      <Section n={5} title="Social Media Advertising">
        <P>
          <Lead>Meta (Facebook/Instagram):</Lead> Our ads comply with Meta
          Advertising Standards, including policies on misleading claims, personal
          attributes, and employment advertising. Landing pages accurately
          represent our services and match the claims made in our ads.
        </P>
        <P>
          <Lead>Google/YouTube:</Lead> Our ads and landing pages comply with
          Google Ads policies, including policies on misrepresentation, unreliable
          claims, and business identity verification. We participate in
          Google&rsquo;s advertiser identity verification program where required.
        </P>
        <P>
          <Lead>TikTok:</Lead> Our ads comply with TikTok&rsquo;s Advertising
          Policies and Community Guidelines, including requirements for clear
          business identification, honest representation, and responsible
          advertising practices.
        </P>
        <P>
          <Lead>LinkedIn:</Lead> Our ads comply with LinkedIn Advertising
          Policies, including truthful representation and professional standards.
        </P>
      </Section>

      <Section n={6} title="Remarketing and Tracking">
        <P>
          We may use remarketing pixels and tracking technologies from Meta,
          Google, TikTok, and other advertising platforms to serve targeted
          advertisements to individuals who have previously visited our website.
          These technologies collect anonymous browsing data and do not collect
          personally identifiable information without your consent. You can opt out
          of personalized advertising through your cookie preferences on our site,
          the advertising platform&rsquo;s ad settings, or the Digital Advertising
          Alliance&rsquo;s opt-out page at{" "}
          <ExtLink href="https://optout.aboutads.info">
            optout.aboutads.info
          </ExtLink>
          .
        </P>
      </Section>

      <Section n={7} title="Contact Us">
        <P>
          If you have questions about our advertising practices, contact us at:
        </P>
        <CompanyContact />
      </Section>
    </LegalDoc>
  );
}
