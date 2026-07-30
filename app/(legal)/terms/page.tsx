import type { Metadata } from "next";
import {
  LegalDoc,
  Section,
  P,
  Lead,
  SubHead,
  MailLink,
  CompanyContact,
} from "@/components/legal/legal-doc";

export const metadata: Metadata = {
  title: "Terms of Service | SpeedSettr",
  description:
    "The legally binding terms governing your use of Speedsettr LLC's website, products, and services.",
};


export default function TermsPage() {
  return (
    <LegalDoc
      title="Terms of Service"
      updated="April 22, 2026"
      effective="April 22, 2026"
    >
      <P>
        These Terms of Service (&ldquo;Terms&rdquo;) constitute a legally binding
        agreement between you (&ldquo;User,&rdquo; &ldquo;Client,&rdquo;
        &ldquo;Talent,&rdquo; or &ldquo;you&rdquo;) and Speedsettr LLC
        (&ldquo;Company,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or
        &ldquo;our&rdquo;), a limited liability company registered in the State of
        New York. By accessing or using our website (speedsettr.com), purchasing
        any product or service, or engaging with us in any way, you acknowledge
        that you have read, understood, and agree to be bound by these Terms. If
        you do not agree, do not use our services.
      </P>

      <Section n={1} title="Description of Services">
        <P>
          Speedsettr provides remote talent sourcing, screening, vetting,
          placement, and related recruitment services for business owners and
          organizations (&ldquo;Clients&rdquo;), as well as training programs
          (including the Remote Talent Foundations Course) and placement services
          for aspiring remote professionals (&ldquo;Talent&rdquo;). We act as a
          staffing intermediary and recruitment consultant. We do not establish an
          employer-employee relationship between Speedsettr and placed Talent, or
          between Speedsettr and Clients. The working relationship is formed
          directly between the Client and the Talent upon placement.
        </P>
      </Section>

      <Section n={2} title="Eligibility">
        <P>
          You must be at least 18 years of age, legally capable of entering into
          binding contracts, and not prohibited from using our services under
          applicable law. By using our services, you represent and warrant that
          you meet these eligibility requirements.
        </P>
      </Section>

      <Section n={3} title="Account and Information Accuracy">
        <P>
          You agree to provide accurate, current, and complete information when
          using our services, and to update such information as necessary. You are
          responsible for maintaining the confidentiality of any account
          credentials and for all activity under your account.
        </P>
      </Section>

      <Section n={4} title="Client Responsibilities">
        <P>
          Clients are responsible for providing accurate and complete information
          about role requirements, job expectations, compensation terms, and
          company details. Clients agree to treat placed Talent professionally and
          in full compliance with all applicable laws, including employment,
          labor, tax, and anti-discrimination laws in their jurisdiction.
          Speedsettr is not liable for disputes between Clients and placed Talent
          outside the scope of our placement services, including but not limited
          to wage disputes, wrongful termination claims, or workplace conditions.
        </P>
      </Section>

      <Section n={5} title="Remote Talent Responsibilities">
        <P>
          Applicants and placed Talent agree to provide truthful, verifiable
          information about their skills, experience, qualifications, and work
          history. Talent agrees to perform work with professionalism, integrity,
          and in accordance with any agreements made with the Client.
          Misrepresentation of skills, qualifications, or identity may result in
          immediate removal from the Speedsettr platform and termination of any
          active placement.
        </P>
      </Section>

      <Section n={6} title="90-Day Replacement Guarantee">
        <P>
          Speedsettr provides a 90-Day Replacement Guarantee on qualifying
          placements. If a placed remote professional is not the right fit within
          90 calendar days of their start date, Speedsettr will source and place a
          replacement at no additional recruitment fee. This guarantee is subject
          to the specific terms in the individual service agreement between
          Speedsettr and the Client. The guarantee does not apply if the Talent
          was terminated for reasons unrelated to job performance or role fit, the
          Client materially changed the role requirements after placement, or the
          Client failed to provide a reasonable onboarding or working environment.
        </P>
      </Section>

      <Section n={7} title="Pricing, Payment, and Billing">
        <P>
          All fees, pricing structures, and payment schedules will be clearly
          outlined in individual service agreements or on the applicable purchase
          page prior to any transaction.
        </P>
        <P>
          <Lead>Billing Descriptor:</Lead> Charges from Speedsettr will appear on
          your statement as &ldquo;SPEEDSETTR LLC&rdquo; or
          &ldquo;SPEEDSETTR.&rdquo;
        </P>
        <P>
          All prices are in USD unless otherwise stated. Payment is due according
          to the terms in your service agreement or at the time of purchase for
          digital products. We accept payment via major credit cards and other
          methods supported by our payment processors (Stripe, PayPal, or similar
          PCI-DSS compliant processors). Late or failed payments may result in
          suspension of services, late fees as outlined in your agreement, and
          referral to collections if necessary. You agree to pay all applicable
          taxes associated with your purchase.
        </P>
      </Section>

      <Section n={8} title="Chargebacks and Disputes">
        <P>
          We take chargebacks and payment disputes seriously. If you have a
          billing concern, you agree to contact us first at <MailLink /> before
          initiating a chargeback with your bank or payment provider. We commit to
          responding to all billing inquiries within 2 business days. Filing a
          chargeback without first attempting to resolve the issue directly with
          Speedsettr may result in suspension of services, pursuit of the disputed
          amount through collections, and a chargeback processing fee. Fraudulent
          chargebacks (disputes filed despite services being delivered as
          described) may be reported to relevant authorities and payment networks.
        </P>
      </Section>

      <Section n={9} title="Intellectual Property">
        <P>
          All content on the Speedsettr website and in our products, including but
          not limited to text, graphics, logos, images, videos, course materials,
          templates, software, and proprietary methodologies, is the exclusive
          property of Speedsettr LLC and is protected by U.S. and international
          intellectual property laws. You may not reproduce, distribute, modify,
          create derivative works from, publicly display, or commercially exploit
          any content without our prior written consent. Course materials are
          licensed for personal use only and may not be shared, resold, or
          redistributed.
        </P>
      </Section>

      <Section n={10} title="Limitation of Liability">
        <P>
          TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, SPEEDSETTR LLC, ITS
          OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, AND AFFILIATES SHALL NOT BE
          LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY,
          OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF REVENUE,
          PROFITS, DATA, BUSINESS OPPORTUNITIES, GOODWILL, OR OTHER INTANGIBLE
          LOSSES, ARISING OUT OF OR RELATED TO YOUR USE OF OUR SERVICES, WHETHER
          BASED ON WARRANTY, CONTRACT, TORT (INCLUDING NEGLIGENCE), STRICT
          LIABILITY, OR ANY OTHER LEGAL THEORY. OUR TOTAL AGGREGATE LIABILITY FOR
          ALL CLAIMS ARISING OUT OF OR RELATED TO THESE TERMS OR OUR SERVICES
          SHALL NOT EXCEED THE TOTAL FEES ACTUALLY PAID BY YOU TO SPEEDSETTR IN
          THE TWELVE (12) MONTHS IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO
          THE CLAIM.
        </P>
      </Section>

      <Section n={11} title="Indemnification">
        <P>
          You agree to indemnify, defend, and hold harmless Speedsettr LLC, its
          officers, directors, employees, agents, and affiliates from and against
          any and all claims, demands, losses, damages, liabilities, costs, and
          expenses (including reasonable attorneys&rsquo; fees) arising from or
          related to your use of our services, your violation of these Terms, your
          violation of any applicable law or regulation, your violation of the
          rights of any third party, and any content or information you provide to
          us.
        </P>
      </Section>

      <Section n={12} title="Non-Solicitation and Non-Circumvention">
        <P>
          Clients agree not to directly recruit, hire, solicit, or engage any
          candidate introduced, presented, or identified by Speedsettr outside of
          the Speedsettr placement process for a period of twenty-four (24) months
          from the date of introduction. This includes candidates who were
          presented but not ultimately placed. Violation of this clause will
          result in a placement fee equal to 100% of the standard recruitment fee
          for that role, payable within 30 days of invoice. This obligation
          survives termination of any service agreement.
        </P>
      </Section>

      <Section n={13} title="Confidentiality">
        <P>
          Both parties agree to keep strictly confidential any proprietary,
          sensitive, or non-public information shared during the course of
          services, including but not limited to business strategies, candidate
          information, client lists, pricing, and internal processes. This
          obligation survives the termination of any service agreement for a
          period of three (3) years.
        </P>
      </Section>

      <Section n={14} title="Anti-Fraud and Prohibited Uses">
        <P>
          You agree not to use our services for any fraudulent, unlawful, or
          deceptive purpose; provide false or misleading information; attempt to
          circumvent our security measures; use automated systems to scrape or
          collect data from our Site; or interfere with or disrupt our services. We
          reserve the right to investigate and take appropriate legal action
          against violations.
        </P>
      </Section>

      <Section n={15} title="Dispute Resolution">
        <SubHead>Informal Resolution</SubHead>
        <P>
          Before filing any formal legal claim, you agree to first contact us at{" "}
          <MailLink /> and attempt to resolve the dispute informally for a period of at
          least 30 days.
        </P>

        <SubHead>Arbitration</SubHead>
        <P>
          If informal resolution is unsuccessful, any dispute, claim, or
          controversy arising out of or relating to these Terms or our services
          shall be resolved through binding arbitration administered by the
          American Arbitration Association (AAA) under its Commercial Arbitration
          Rules. The arbitration shall take place in Albany County, New York. The
          arbitrator&rsquo;s decision shall be final and binding and may be entered
          as a judgment in any court of competent jurisdiction.
        </P>

        <SubHead>Class Action Waiver</SubHead>
        <P>
          You agree that any dispute resolution proceedings will be conducted on
          an individual basis only, and not as a class, consolidated, or
          representative action.
        </P>

        <SubHead>Exceptions</SubHead>
        <P>
          Either party may seek injunctive or equitable relief in a court of
          competent jurisdiction to prevent the actual or threatened infringement
          of intellectual property rights or breach of confidentiality
          obligations.
        </P>
      </Section>

      <Section n={16} title="Termination">
        <P>
          We reserve the right to suspend or terminate your access to our services
          at any time, with or without cause, and with or without notice,
          including for violation of these Terms. Upon termination, all rights
          granted to you under these Terms will immediately cease. Sections
          relating to limitation of liability, indemnification, confidentiality,
          non-solicitation, dispute resolution, and intellectual property shall
          survive termination.
        </P>
      </Section>

      <Section n={17} title="Force Majeure">
        <P>
          Speedsettr shall not be liable for any delay or failure to perform its
          obligations due to events beyond its reasonable control, including but
          not limited to natural disasters, pandemics, government actions,
          internet or infrastructure failures, or acts of terrorism.
        </P>
      </Section>

      <Section n={18} title="Severability">
        <P>
          If any provision of these Terms is found to be invalid, illegal, or
          unenforceable, the remaining provisions shall continue in full force and
          effect.
        </P>
      </Section>

      <Section n={19} title="Entire Agreement">
        <P>
          These Terms, together with any applicable service agreements and our
          Privacy Policy, constitute the entire agreement between you and
          Speedsettr regarding the use of our services, and supersede all prior or
          contemporaneous agreements, representations, and understandings.
        </P>
      </Section>

      <Section n={20} title="Governing Law">
        <P>
          These Terms shall be governed by and construed in accordance with the
          laws of the State of New York, without regard to its conflict of law
          provisions.
        </P>
      </Section>

      <Section n={21} title="Changes to Terms">
        <P>
          We reserve the right to modify these Terms at any time. Material changes
          will be posted on this page with an updated &ldquo;Last Updated&rdquo;
          date. Where required by law, we will provide notice via email. Continued
          use of our services after changes constitutes acceptance of the updated
          Terms.
        </P>
      </Section>

      <Section n={22} title="Contact Us">
        <P>If you have any questions about these Terms, contact us at:</P>
        <CompanyContact />
      </Section>
    </LegalDoc>
  );
}
