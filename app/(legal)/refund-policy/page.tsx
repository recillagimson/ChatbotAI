import type { Metadata } from "next";
import {
  LegalDoc,
  Section,
  P,
  Lead,
  MailLink,
  CompanyContact,
} from "@/components/legal/legal-doc";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy | SpeedSettr",
  description:
    "Speedsettr LLC's refund, replacement, and cancellation terms for all services and products.",
};

export default function RefundPolicyPage() {
  return (
    <LegalDoc
      title="Refund &amp; Cancellation Policy"
      updated="April 22, 2026"
      effective="April 22, 2026"
    >
      <P>
        Speedsettr LLC (&ldquo;Company,&rdquo; &ldquo;we,&rdquo;
        &ldquo;us,&rdquo; or &ldquo;our&rdquo;) is committed to transparency in
        all transactions. This policy outlines our refund, replacement, and
        cancellation terms for all services and products. By purchasing any
        service or product from Speedsettr, you acknowledge that you have read and
        agree to this policy.
      </P>

      <Section n={1} title="Placement Services (For Business Owners)">
        <P>
          <Lead>90-Day Replacement Guarantee:</Lead> Speedsettr provides a 90-Day
          Replacement Guarantee on all qualifying talent placements. If a placed
          remote professional is not the right fit within 90 calendar days of
          their start date, Speedsettr will source and place a suitable
          replacement at no additional recruitment fee, subject to the terms in
          your service agreement.
        </P>
        <P>
          <Lead>Recruitment Fees:</Lead> Recruitment and placement fees are earned
          upon successful placement and acceptance of a candidate by the Client.
          Once a candidate has been accepted and onboarding has commenced,
          recruitment fees are non-refundable. This reflects the significant time,
          labor, and resources invested in sourcing, screening, and vetting
          candidates.
        </P>
        <P>
          <Lead>Pre-Placement Cancellation:</Lead> If a Client cancels a
          recruitment engagement before any candidates have been presented, a full
          refund of any prepaid fees will be issued within 14 business days. If
          candidates have already been sourced and presented, a partial refund may
          be issued at the Company&rsquo;s discretion, less costs incurred for work
          already performed.
        </P>
        <P>
          <Lead>Replacement Guarantee Exclusions:</Lead> The 90-Day Replacement
          Guarantee does not apply if the Talent was terminated for reasons
          unrelated to job performance or role fit, the Client materially changed
          the role requirements, scope, or compensation after placement, the
          Client failed to provide a reasonable onboarding environment or working
          conditions, or the Client violated the terms of the service agreement.
        </P>
      </Section>

      <Section n={2} title="Remote Talent Foundations Course (Digital Products)">
        <P>
          Due to the digital nature of the course and the immediate access to
          materials granted upon purchase, all course sales are final and
          non-refundable. This policy is clearly disclosed at the point of
          purchase prior to completing your transaction. By completing your
          purchase, you acknowledge and agree that you are waiving any right to a
          refund once access is granted.
        </P>
        <P>
          <Lead>Technical Issues:</Lead> If you experience technical issues that
          prevent you from accessing the course content, contact us at{" "}
          <MailLink /> within 7 days of purchase. We will work to resolve the
          issue promptly. If we are unable to provide access, a full refund will
          be issued.
        </P>
        <P>
          <Lead>Unauthorized Charges:</Lead> If you believe a charge was made
          without your authorization, contact us immediately at <MailLink /> and
          we will investigate within 2 business days.
        </P>
      </Section>

      <Section n={3} title="Consulting and Custom Services">
        <P>
          Fees for consulting engagements, business audits, and custom recruitment
          projects are outlined in individual service agreements signed by both
          parties. Refund and cancellation terms for these services are governed
          exclusively by the specific agreement. In the absence of specific terms,
          a pro-rated refund may be issued for services not yet rendered, at the
          Company&rsquo;s discretion.
        </P>
      </Section>

      <Section n={4} title="Billing Disputes">
        <P>
          <Lead>Contact Us First:</Lead> If you have any concerns about a charge,
          we strongly encourage you to contact us at <MailLink /> before disputing
          the charge with your bank or payment provider. We are committed to
          resolving billing issues fairly and promptly, and we respond to all
          inquiries within 2 business days. Filing a chargeback or payment dispute
          without first contacting us may delay resolution and could result in
          additional fees or suspension of services.
        </P>
      </Section>

      <Section n={5} title="Refund Processing">
        <P>
          Approved refunds will be processed to the original payment method within
          5&ndash;10 business days. Depending on your bank or payment provider, it
          may take an additional 5&ndash;10 business days for the refund to appear
          on your statement. Refunds are issued in USD.
        </P>
      </Section>

      <Section n={6} title="How to Request a Replacement or Refund">
        <P>
          To request a replacement under the 90-Day Guarantee, report a billing
          issue, or inquire about a refund, contact us at:
        </P>
        <CompanyContact />
        <P>
          Please include your full name, the service or product purchased, date of
          purchase, transaction or invoice number (if available), and a
          description of your request or concern. We aim to acknowledge all
          inquiries within 1 business day and resolve them within 5 business days.
        </P>
      </Section>
    </LegalDoc>
  );
}
