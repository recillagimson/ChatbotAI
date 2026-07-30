import type { Metadata } from "next";
import { LegalDoc, Section, P, Lead } from "@/components/legal/legal-doc";

export const metadata: Metadata = {
  title: "Disclaimer | SpeedSettr",
  description:
    "Important disclaimers regarding Speedsettr LLC's website, services, results, and third-party tools.",
};

export default function DisclaimerPage() {
  return (
    <LegalDoc
      title="Disclaimer"
      updated="April 22, 2026"
      effective="April 22, 2026"
    >
      <Section title="General Disclaimer">
        <P>
          The information provided on speedsettr.com and through Speedsettr
          LLC&rsquo;s services is for general informational purposes only. While
          we strive to keep information accurate and up to date, Speedsettr LLC
          makes no representations or warranties of any kind, express or implied,
          about the completeness, accuracy, reliability, suitability, or
          availability of the information, products, services, or related graphics
          contained on this website for any purpose. Any reliance you place on
          such information is strictly at your own risk.
        </P>
      </Section>

      <Section title="No Guarantee of Results">
        <P>
          <Lead>IMPORTANT:</Lead> Testimonials, case studies, and performance
          figures on this website represent the experiences of specific
          individuals and businesses. These results are not typical and are not
          intended to guarantee that you or anyone else will achieve the same or
          similar results. Results vary significantly depending on individual
          circumstances, effort, industry, market conditions, and many other
          factors beyond our control.
        </P>
        <P>
          Revenue figures such as &ldquo;$70K to $800K/month,&rdquo; placement
          numbers such as &ldquo;600+,&rdquo; and other metrics reflect the
          Company&rsquo;s historical track record and the experiences of specific
          clients. They are not projections, promises, or guarantees of future
          performance or income. Past performance is not indicative of future
          results.
        </P>
      </Section>

      <Section title="Not Professional Advice">
        <P>
          Nothing on this website or in our services constitutes legal, tax,
          financial, accounting, or employment advice. Speedsettr provides
          staffing, recruitment, and training services only. Clients and Talent
          are strongly encouraged to consult with qualified legal counsel, tax
          advisors, and financial professionals regarding contracts, compliance,
          tax obligations, labor classification, and laws applicable to their
          specific jurisdiction and situation.
        </P>
      </Section>

      <Section title="Independent Contractor Relationship">
        <P>
          Remote talent placed through Speedsettr are independent contractors or
          direct hires of the Client, not employees of Speedsettr LLC, unless
          explicitly specified in a separate written agreement. Speedsettr is not
          the employer of record for any placed Talent. Speedsettr is not
          responsible for tax withholding, employment benefits, workers&rsquo;
          compensation, health insurance, unemployment insurance, or compliance
          obligations between Clients and their hired Talent. Clients are solely
          responsible for ensuring compliance with all applicable labor laws, tax
          regulations, and employment requirements in their jurisdiction.
        </P>
      </Section>

      <Section title="Third-Party Services and Tools">
        <P>
          Speedsettr may recommend, integrate with, or facilitate access to
          third-party tools, platforms, and services (including but not limited to
          CRM systems, screen monitoring software, payment processors, and
          communication tools). We are not responsible for the performance,
          availability, security, accuracy, or policies of any third-party
          services. Your use of third-party services is governed by their
          respective terms and policies.
        </P>
      </Section>

      <Section title="Website Availability">
        <P>
          We do not guarantee that our website will be available at all times or
          that it will be free of errors, viruses, or other harmful components. We
          reserve the right to modify, suspend, or discontinue any aspect of our
          website at any time without notice.
        </P>
      </Section>

      <Section title="Earnings and Income Disclaimer">
        <P>
          Any references to income, revenue, savings, or financial results on this
          website, in our marketing materials, or in testimonials are illustrative
          only and based on the specific experiences of Speedsettr and individual
          clients. There is no guarantee that you will earn any money or achieve
          any specific financial result using our services or information. Your
          results will depend on many factors including your own skills,
          knowledge, ability, dedication, business savvy, market conditions, and
          other circumstances. We are not responsible for your actions or results.
          You are solely responsible for your own decisions and outcomes.
        </P>
      </Section>

      <Section title="Testimonial Disclaimer">
        <P>
          Testimonials on this website are from real clients and remote talent.
          However, they reflect individual experiences and opinions and should not
          be considered as a guarantee of similar results. Some testimonials may
          have been edited for clarity or length but not for substance.
        </P>
      </Section>
    </LegalDoc>
  );
}
