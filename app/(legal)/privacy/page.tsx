import type { Metadata } from "next";
import {
  LegalDoc,
  Section,
  P,
  Lead,
  SubHead,
  List,
  MailLink,
  CompanyContact,
} from "@/components/legal/legal-doc";

export const metadata: Metadata = {
  title: "Privacy Policy | SpeedSettr",
  description:
    "How Speedsettr LLC collects, uses, stores, shares, and protects your personal information.",
};


export default function PrivacyPolicyPage() {
  return (
    <LegalDoc title="Privacy Policy" updated="July 31, 2026">
      <P>
        Speedsettr (&ldquo;Company,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
        &ldquo;our&rdquo;), a limited liability company registered in the State of
        New York, operates the website speedsettr.com (the &ldquo;Site&rdquo;).
        This Privacy Policy describes how we collect, use, store, share, and
        protect personal information when you visit our Site, use our services, or
        make a purchase. By using our Site or services, you consent to the
        practices described in this policy.
      </P>

      <Section n={1} title="Information We Collect">
        <P>
          <Lead>Information You Provide Directly:</Lead> When you fill out a
          contact form, book a consultation call, apply for placement, purchase a
          course, or otherwise interact with our services, we may collect your
          full name, email address, phone number, country of residence, billing
          address, payment information (processed securely through third-party
          payment processors; we do not store credit card numbers on our servers),
          professional background and resume information, and any other
          information you voluntarily submit.
        </P>
        <P>
          <Lead>Information Collected Automatically:</Lead> When you visit our
          Site, we automatically collect your IP address and approximate
          geolocation, browser type, device type, and operating system, referring
          URLs and exit pages, pages viewed, time spent on pages, and dates and
          times of visits, and unique device identifiers.
        </P>
        <P>
          <Lead>Cookies and Tracking Technologies:</Lead> We use cookies, web
          beacons, pixels, and similar tracking technologies to improve your
          browsing experience, analyze website traffic and usage patterns,
          remember your preferences, deliver relevant content, and measure the
          effectiveness of our marketing campaigns. You can manage cookie
          preferences through your browser settings. Disabling cookies may affect
          certain features of our Site.
        </P>
        <P>
          <Lead>Third-Party Analytics:</Lead> We use third-party analytics
          services (such as Google Analytics) that collect information about your
          use of our Site. These services may use cookies and similar technologies
          to collect and analyze usage data.
        </P>
        <P>
          <Lead>Advertising Pixels and Tags:</Lead> We may use tracking pixels and
          tags from advertising platforms including Meta (Facebook Pixel,
          Instagram), Google (Google Ads, YouTube), TikTok (TikTok Pixel), and
          LinkedIn (LinkedIn Insight Tag) to measure ad performance, build
          remarketing audiences, and optimize our advertising. These tools may
          collect data about your browsing activity on our Site. You may opt out
          of personalized advertising through our cookie consent banner, through
          each platform&rsquo;s ad settings, or through industry opt-out tools at{" "}
          <a
            href="https://optout.aboutads.info"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#a5b4fc] underline-offset-4 hover:underline"
          >
            optout.aboutads.info
          </a>{" "}
          or{" "}
          <a
            href="https://www.youronlinechoices.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#a5b4fc] underline-offset-4 hover:underline"
          >
            youronlinechoices.com
          </a>
          .
        </P>
      </Section>

      <Section n={2} title="Legal Basis for Processing (GDPR)">
        <P>
          If you are located in the European Economic Area (EEA), United Kingdom,
          or other jurisdiction with similar data protection laws, we process your
          personal data based on your consent (e.g., when you submit a form or opt
          in to marketing), contractual necessity (e.g., to fulfill a service you
          purchased), legitimate interests (e.g., improving our services,
          preventing fraud), and legal obligations (e.g., tax and accounting
          requirements).
        </P>
      </Section>

      <Section n={3} title="How We Use Your Information">
        <P>We use the information we collect to:</P>
        <List
          items={[
            "Provide, operate, and improve our services.",
            "Process transactions and send related information (receipts, confirmations, invoices).",
            "Respond to your inquiries and provide customer support.",
            "Process applications for remote talent placement.",
            "Match business owners with qualified remote professionals.",
            "Send marketing communications (only with your explicit consent, and you may opt out at any time).",
            "Monitor and analyze usage trends to improve user experience.",
            "Detect, prevent, and address fraud, abuse, or security issues.",
            "Comply with applicable laws, regulations, and legal processes.",
            "Enforce our Terms of Service and other agreements.",
          ]}
        />
      </Section>

      <Section n={4} title="How We Share Your Information">
        <P>
          We do not sell, rent, or trade your personal information to third
          parties for their marketing purposes. We may share your information
          with:
        </P>
        <List
          items={[
            "Payment processors (e.g., Stripe, PayPal) to process transactions securely.",
            "Service providers who assist in operating our Site and delivering services (CRM platforms, email marketing tools, analytics providers, hosting services).",
            "Business partners, only when necessary to fulfill a specific placement or service request and only with your knowledge.",
            "Legal authorities when required by law, subpoena, court order, or to protect our rights, safety, or property.",
            "A successor entity in connection with a merger, acquisition, or sale of assets (you will be notified of any change in ownership or control of your personal data).",
          ]}
        />
        <P>
          All third-party service providers are contractually obligated to protect
          your data and use it only for the purposes we specify.
        </P>
      </Section>

      <Section n={5} title="Payment Data Security">
        <P>
          All payment transactions are processed through PCI-DSS compliant
          third-party payment processors. We do not store, process, or have access
          to your full credit card numbers, CVV codes, or banking details on our
          servers. Payment data is encrypted in transit using SSL/TLS encryption.
        </P>
      </Section>

      <Section n={6} title="Data Retention">
        <P>
          We retain your personal information only for as long as necessary to
          fulfill the purposes for which it was collected, comply with legal and
          regulatory obligations, resolve disputes, and enforce our agreements.
          When personal data is no longer needed, we securely delete or anonymize
          it.
        </P>
      </Section>

      <Section n={7} title="Your Rights">
        <SubHead>All Users</SubHead>
        <List
          items={[
            'You may opt out of marketing emails at any time by clicking the "unsubscribe" link in any email or by contacting us.',
            "You may request access to the personal information we hold about you.",
            "You may request correction of inaccurate personal information.",
            "You may request deletion of your personal information (subject to legal obligations).",
          ]}
        />

        <SubHead>California Residents (CCPA/CPRA)</SubHead>
        <List
          items={[
            "You have the right to know what personal information we collect, use, and share.",
            "You have the right to request deletion of your personal information.",
            "You have the right to opt out of the sale of personal information (we do not sell personal data).",
            "You have the right to non-discrimination for exercising your privacy rights.",
          ]}
        />
        <P>
          To submit a request, email <MailLink /> with the subject line &ldquo;CCPA
          Request.&rdquo;
        </P>

        <SubHead>EEA/UK Residents (GDPR)</SubHead>
        <P>
          You have additional rights including data portability, the right to
          restrict processing, the right to object to processing, and the right to
          withdraw consent at any time. To exercise these rights, contact <MailLink />.
          We will respond within 30 days.
        </P>
      </Section>

      <Section n={8} title="Data Security">
        <P>We implement industry-standard security measures including:</P>
        <List
          items={[
            "SSL/TLS encryption for data in transit.",
            "Secure server infrastructure with regular security updates.",
            "Access controls limiting employee access to personal data on a need-to-know basis.",
            "Regular security assessments and monitoring.",
          ]}
        />
        <P>
          Despite these measures, no method of transmission over the internet or
          electronic storage is 100% secure. We cannot guarantee absolute security
          but are committed to protecting your information using commercially
          reasonable standards.
        </P>
      </Section>

      <Section n={9} title="International Data Transfers">
        <P>
          Your information may be transferred to and processed in countries other
          than your country of residence. We ensure that appropriate safeguards
          are in place to protect your data in accordance with applicable data
          protection laws.
        </P>
      </Section>

      <Section n={10} title="Third-Party Links">
        <P>
          Our Site may contain links to third-party websites, services, or
          applications. We are not responsible for the privacy practices or
          content of those third parties. We encourage you to review their privacy
          policies before providing any personal information.
        </P>
      </Section>

      <Section n={11} title="Children's Privacy">
        <P>
          Our services are not directed to individuals under the age of 18. We do
          not knowingly collect personal information from children under 18. If we
          learn that we have collected personal information from a child under 18,
          we will promptly delete it.
        </P>
      </Section>

      <Section n={12} title="Do Not Track Signals">
        <P>
          Some browsers offer a &ldquo;Do Not Track&rdquo; (DNT) feature. Our Site
          does not currently respond to DNT signals, as there is no
          industry-standard for compliance.
        </P>
      </Section>

      <Section n={13} title="CAN-SPAM Act Compliance">
        <P>
          We comply with the CAN-SPAM Act of 2003. All marketing emails sent by
          Speedsettr will clearly identify Speedsettr LLC as the sender, include
          our physical mailing address (231 East 5th St New York 10003), provide a
          clear and conspicuous opt-out mechanism, honor opt-out requests within 10
          business days, and will not use deceptive subject lines or false header
          information. To unsubscribe from marketing communications, click the
          &ldquo;unsubscribe&rdquo; link in any email or contact <MailLink />.
        </P>
      </Section>

      <Section n={14} title={`California "Shine the Light" Law`}>
        <P>
          Under California Civil Code Section 1798.83, California residents have
          the right to request information about the disclosure of personal
          information to third parties for direct marketing purposes. As stated in
          this Privacy Policy, we do not disclose personal information to third
          parties for their direct marketing purposes. If you have questions,
          contact <MailLink />.
        </P>
      </Section>

      <Section n={15} title="Changes to This Policy">
        <P>
          We may update this Privacy Policy from time to time. Material changes
          will be posted on this page with an updated &ldquo;Last Updated&rdquo;
          date. If changes are significant, we may notify you via email or a
          prominent notice on our Site. Continued use of our services after
          changes constitutes acceptance of the updated policy.
        </P>
      </Section>

      <Section n={16} title="Contact Us">
        <P>
          If you have questions, concerns, or requests regarding this Privacy
          Policy or your personal data, contact us at:
        </P>
        <CompanyContact />
        <P>
          For GDPR-related inquiries, you may also lodge a complaint with your
          local data protection authority.
        </P>
      </Section>
    </LegalDoc>
  );
}
