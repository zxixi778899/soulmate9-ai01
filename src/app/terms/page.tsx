import Link from 'next/link';

export default function TermsOfServicePage() {
  const legalEntity = process.env.LEGAL_ENTITY_NAME || 'SoulMate AI';
  const supportEmail = process.env.LEGAL_CONTACT_EMAIL || 'support@soulmateai.shop';
  const jurisdiction = process.env.LEGAL_JURISDICTION || 'the jurisdiction stated at checkout';
  const adultMode = process.env.CONTENT_MODE === 'adult';
  return (
    <div className="min-h-screen bg-background">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Terms of Service
          </h1>
          <p className="mt-3 text-muted-foreground leading-relaxed max-w-xl mx-auto">
            Please read these terms carefully before using SoulMate AI. By using our service,
            you agree to be bound by these terms.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Last updated: July 14, 2026
          </p>
        </div>

        {/* Introduction */}
        <section className="bg-card/40 backdrop-blur-sm border border-border/30 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-semibold mt-0 mb-3 text-foreground">Introduction</h2>
          <div className="border-t border-border/20 mb-4" />
          <p className="text-muted-foreground leading-relaxed">
            These Terms of Service (&ldquo;Terms&rdquo;) govern your use of the SoulMate AI
            application, website, and related services (collectively, the &ldquo;Service&rdquo;),
            operated by {legalEntity} (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or
            &ldquo;our&rdquo;). By accessing or using the Service, you agree to be bound by
            these Terms. If you do not agree, please do not use the Service.
          </p>
        </section>

        {/* Eligibility */}
        <section className="bg-card/40 backdrop-blur-sm border border-border/30 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-semibold mt-0 mb-3 text-foreground">Eligibility</h2>
          <div className="border-t border-border/20 mb-4" />
          <p className="text-muted-foreground leading-relaxed">
            You must be at least 18 years old to use the Service. By using the Service, you
            represent and warrant that you are at least 18 years of age and have the full power
            and authority to enter into these Terms. The Service is not intended for children
            under the age of 18, and we do not knowingly collect personal information from
            anyone under 18.
          </p>
        </section>

        {/* Account Registration */}
        <section className="bg-card/40 backdrop-blur-sm border border-border/30 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-semibold mt-0 mb-3 text-foreground">Account Registration</h2>
          <div className="border-t border-border/20 mb-4" />
          <p className="text-muted-foreground leading-relaxed">
            When you create an account with us, you agree to provide accurate, current, and
            complete information. You are responsible for maintaining the confidentiality of
            your account credentials and for all activities that occur under your account. You
            must notify us immediately of any unauthorized use of your account. We reserve the
            right to suspend or terminate accounts that provide false or misleading information.
          </p>
        </section>

        {/* Subscriptions & Payments */}
        <section className="bg-card/40 backdrop-blur-sm border border-border/30 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-semibold mt-0 mb-3 text-foreground">Subscriptions &amp; Payments</h2>
          <div className="border-t border-border/20 mb-4" />
          <p className="text-muted-foreground leading-relaxed">
            SoulMate AI offers several subscription tiers: <strong>Free</strong>,{' '}
            <strong>Pro</strong>, and <strong>Unlimited</strong>. The Free tier provides limited
            access to features. Pro and Unlimited tiers require a recurring subscription fee.
          </p>
          <p className="text-muted-foreground leading-relaxed mt-3">
            All payments are billed in advance on a monthly or annual basis, as selected during
            checkout. Subscriptions automatically renew unless cancelled at least 24 hours before
            the end of the current billing period. You may cancel at any time through your
            account settings, and cancellation will take effect at the end of the current billing
            period. We do not provide refunds for partial billing periods.
          </p>
          <p className="text-muted-foreground leading-relaxed mt-3">
            Prices are subject to change with 30 days&rsquo; notice. Continued use after a price
            change constitutes acceptance of the new price.
          </p>
        </section>

        {/* User Content */}
        <section className="bg-card/40 backdrop-blur-sm border border-border/30 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-semibold mt-0 mb-3 text-foreground">User Content</h2>
          <div className="border-t border-border/20 mb-4" />
          <p className="text-muted-foreground leading-relaxed">
            You retain ownership of any content, messages, images, or other materials you
            submit, post, or display through the Service (&ldquo;User Content&rdquo;). By
            submitting User Content, you grant us a non-exclusive, worldwide, royalty-free
            license to use, reproduce, modify, adapt, publish, and display such User Content
            solely for the purpose of operating, improving, and providing the Service to you.
          </p>
          <p className="text-muted-foreground leading-relaxed mt-3">
            You represent and warrant that your User Content does not violate any third-party
            rights or any applicable laws. We reserve the right, but have no obligation, to
            remove any User Content that violates these Terms.
          </p>
        </section>

        {/* Prohibited Conduct */}
        <section className="bg-card/40 backdrop-blur-sm border border-border/30 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-semibold mt-0 mb-3 text-foreground">Prohibited Conduct</h2>
          <div className="border-t border-border/20 mb-4" />
          <p className="text-muted-foreground leading-relaxed">
            You agree not to engage in any of the following prohibited activities:
          </p>
          <ul className="mt-3 space-y-2 text-muted-foreground leading-relaxed list-disc pl-5">
            <li>Using the Service for any illegal purpose or in violation of any applicable laws or regulations.</li>
            <li>Harassing, abusing, threatening, or intimidating other users or our staff.</li>
            <li>Impersonating any person or entity or misrepresenting your affiliation with any person or entity.</li>
            <li>Interfering with or disrupting the Service, servers, or networks connected to the Service.</li>
            <li>Attempting to gain unauthorized access to any part of the Service or any other systems or networks.</li>
            <li>Using any automated means (bots, scrapers, etc.) to access or collect data from the Service without our express permission.</li>
            <li>Sharing or generating content that is hateful, violent, sexually explicit involving minors, or otherwise objectionable.</li>
          </ul>
        </section>

        {/* Content Nature  NSFW */}
        <section className="bg-card/40 backdrop-blur-sm border border-border/30 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-semibold mt-0 mb-3 text-foreground">Nature of Content</h2>
          <div className="border-t border-border/20 mb-4" />
          <p className="text-muted-foreground leading-relaxed">
            The Service provides AI-generated conversational and visual content featuring
            fictional adult characters (&ldquo;AI Companions&rdquo;). The AI is not a human,
            licensed professional, or emergency service. You acknowledge and agree that:
          </p>
          <ul className="mt-3 space-y-2 text-muted-foreground leading-relaxed list-disc pl-5">
            <li>All AI Companions are entirely fictional. Any resemblance to real persons, living or deceased, is coincidental.</li>
            <li>Conversations, roleplay scenarios, and generated images depict fictional characters and do not represent real relationships, professional advice, or substitute for professional services of any kind.</li>
            {adultMode ? (
              <>
                <li>The Service may include mature and sexually explicit content intended for verified adults only. You control whether to request or view such content.</li>
                <li>Adult content must depict fictional adults and comply with our consent, age, and legality rules.</li>
              </>
            ) : (
              <li>This deployment is configured for non-explicit romantic companion content. Attempts to bypass its content controls are prohibited.</li>
            )}
            <li>You will not request content depicting minors, non-consensual acts, or any illegal activity. Such requests will be refused and may result in account termination.</li>
          </ul>
        </section>

        {/* Intellectual Property */}
        <section className="bg-card/40 backdrop-blur-sm border border-border/30 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-semibold mt-0 mb-3 text-foreground">Intellectual Property</h2>
          <div className="border-t border-border/20 mb-4" />
          <p className="text-muted-foreground leading-relaxed">
            The Service, including its text, graphics, logos, icons, images, audio clips,
            software, and overall design, is owned by {legalEntity} or its licensors and is
            protected by copyright, trademark, and other intellectual property laws. You may not
            reproduce, distribute, modify, create derivative works from, or exploit any part of
            the Service without our prior written consent.
          </p>
          <p className="text-muted-foreground leading-relaxed mt-3">
            The SoulMate AI name, logo, and related trademarks are our exclusive property. All
            other trademarks appearing on the Service are the property of their respective owners.
          </p>
        </section>

        {/* Disclaimer */}
        <section className="bg-card/40 backdrop-blur-sm border border-border/30 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-semibold mt-0 mb-3 text-foreground">Disclaimer</h2>
          <div className="border-t border-border/20 mb-4" />
          <p className="text-muted-foreground leading-relaxed">
            THE SERVICE IS PROVIDED ON AN &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo;
            BASIS WITHOUT ANY WARRANTIES OF ANY KIND, WHETHER EXPRESS OR IMPLIED. TO THE
            FULLEST EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, INCLUDING BUT NOT
            LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
            TITLE, AND NON-INFRINGEMENT.
          </p>
          <p className="text-muted-foreground leading-relaxed mt-3">
            We do not warrant that the Service will be uninterrupted, timely, secure, or
            error-free, or that any defects will be corrected. We are not responsible for any
            harm resulting from your use of the Service, including but not limited to emotional
            distress or reliance on AI-generated content.
          </p>
        </section>

        {/* Limitation of Liability */}
        <section className="bg-card/40 backdrop-blur-sm border border-border/30 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-semibold mt-0 mb-3 text-foreground">Limitation of Liability</h2>
          <div className="border-t border-border/20 mb-4" />
          <p className="text-muted-foreground leading-relaxed">
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL{' '}
            {legalEntity.toUpperCase()} AND ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES,
            OR AGENTS BE LIABLE FOR ANY
            INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT
            LIMITED TO LOSS OF PROFITS, DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES,
            ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE SERVICE.
          </p>
          <p className="text-muted-foreground leading-relaxed mt-3">
            Our total liability to you for any claims arising from these Terms or your use of
            the Service shall not exceed the amount you have paid us in the twelve (12) months
            preceding the event giving rise to the liability.
          </p>
        </section>

        {/* Termination */}
        <section className="bg-card/40 backdrop-blur-sm border border-border/30 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-semibold mt-0 mb-3 text-foreground">Termination</h2>
          <div className="border-t border-border/20 mb-4" />
          <p className="text-muted-foreground leading-relaxed">
            We reserve the right to suspend or terminate your access to the Service at any
            time, with or without cause, with or without notice. Upon termination, your right
            to use the Service will immediately cease. If we terminate your account for a
            violation of these Terms, you will not be entitled to a refund of any prepaid fees.
            You may terminate your account at any time by contacting us or through your account
            settings.
          </p>
        </section>

        <section className="bg-card/40 backdrop-blur-sm border border-border/30 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-semibold mt-0 mb-3 text-foreground">Governing Law</h2>
          <div className="border-t border-border/20 mb-4" />
          <p className="text-muted-foreground leading-relaxed">
            These Terms are governed by the laws of {jurisdiction}, without regard to its
            conflict-of-law rules. Mandatory consumer protections in your place of residence
            continue to apply where they cannot lawfully be waived.
          </p>
        </section>

        {/* Contact */}
        <section className="bg-card/40 backdrop-blur-sm border border-border/30 rounded-xl p-6 mb-8">
          <h2 className="text-xl font-semibold mt-0 mb-3 text-foreground">Contact</h2>
          <div className="border-t border-border/20 mb-4" />
          <p className="text-muted-foreground leading-relaxed">
            If you have any questions about these Terms, please contact us at{' '}
            <a href={`mailto:${supportEmail}`} className="text-primary hover:underline">
              {supportEmail}
            </a>
            .
          </p>
        </section>

        {/* Back to Home */}
        <div className="text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
