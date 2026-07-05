import Link from 'next/link';

export default function PrivacyPolicyPage() {
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
            Privacy Policy
          </h1>
          <p className="mt-3 text-muted-foreground leading-relaxed max-w-xl mx-auto">
            Your privacy matters to us. This policy explains how we collect, use, and protect
            your personal information when you use SoulMate AI.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Last updated: January 1, 2025
          </p>
        </div>

        {/* Information We Collect */}
        <section className="bg-card/40 backdrop-blur-sm border border-border/30 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-semibold mt-0 mb-3 text-foreground">Information We Collect</h2>
          <div className="border-t border-border/20 mb-4" />
          <p className="text-muted-foreground leading-relaxed">
            We collect the following types of information to provide and improve our Service:
          </p>
          <ul className="mt-3 space-y-2 text-muted-foreground leading-relaxed list-disc pl-5">
            <li>
              <strong>Account Information:</strong> When you register, we collect your email
              address, username, and a password (stored securely as a hash). If you sign in
              via Google, we receive your email address and name from your Google profile.
            </li>
            <li>
              <strong>Usage Data:</strong> We automatically collect information about how you
              interact with the Service, including pages visited, features used, session
              duration, and device information (browser type, operating system, IP address).
            </li>
            <li>
              <strong>Messages &amp; Content:</strong> We collect and store the messages you
              send to your AI companion and any other content you create or upload through
              the Service in order to deliver and improve the conversational experience.
            </li>
            <li>
              <strong>Payment Information:</strong> If you subscribe to a paid tier, your
              payment details are processed securely by our third-party payment processor. We
              do not store full credit card numbers on our servers.
            </li>
          </ul>
        </section>

        {/* How We Use Information */}
        <section className="bg-card/40 backdrop-blur-sm border border-border/30 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-semibold mt-0 mb-3 text-foreground">How We Use Information</h2>
          <div className="border-t border-border/20 mb-4" />
          <p className="text-muted-foreground leading-relaxed">
            We use the information we collect for the following purposes:
          </p>
          <ul className="mt-3 space-y-2 text-muted-foreground leading-relaxed list-disc pl-5">
            <li>To operate, maintain, and provide the features of the Service to you.</li>
            <li>To personalize your experience and improve the AI companion responses.</li>
            <li>To communicate with you about your account, including billing, updates, and support.</li>
            <li>To analyze usage patterns and improve the performance, reliability, and user experience of the Service.</li>
            <li>To detect, prevent, and address technical issues, fraud, or abuse.</li>
            <li>To comply with legal obligations and enforce our Terms of Service.</li>
          </ul>
        </section>

        {/* Data Sharing */}
        <section className="bg-card/40 backdrop-blur-sm border border-border/30 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-semibold mt-0 mb-3 text-foreground">Data Sharing</h2>
          <div className="border-t border-border/20 mb-4" />
          <p className="text-muted-foreground leading-relaxed">
            We do not sell your personal information to third parties. We may share your
            information in the following circumstances:
          </p>
          <ul className="mt-3 space-y-2 text-muted-foreground leading-relaxed list-disc pl-5">
            <li>
              <strong>Service Providers:</strong> We engage trusted third-party companies to
              perform functions on our behalf, such as payment processing, cloud hosting, email
              delivery, and analytics. These providers have access to only the information
              necessary to perform their functions and are contractually obligated to protect
              your data.
            </li>
            <li>
              <strong>Legal Compliance:</strong> We may disclose your information if required
              by law, subpoena, or other legal process, or if we believe in good faith that
              disclosure is necessary to protect our rights, your safety, or the safety of
              others.
            </li>
            <li>
              <strong>Business Transfers:</strong> In the event of a merger, acquisition, or
              sale of all or substantially all of our assets, your information may be
              transferred as part of that transaction. We will notify you via email or a
              prominent notice on the Service of any change in ownership.
            </li>
          </ul>
        </section>

        {/* Data Security */}
        <section className="bg-card/40 backdrop-blur-sm border border-border/30 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-semibold mt-0 mb-3 text-foreground">Data Security</h2>
          <div className="border-t border-border/20 mb-4" />
          <p className="text-muted-foreground leading-relaxed">
            We take reasonable administrative, technical, and physical measures to protect
            your personal information from unauthorized access, disclosure, alteration, or
            destruction. These measures include encryption in transit (TLS 1.2+) and at rest,
            regular security audits, and strict access controls. However, no method of
            transmission or storage is 100% secure, and we cannot guarantee absolute security.
          </p>
        </section>

        {/* Adult Content Storage  NSFW */}
        <section className="bg-card/40 backdrop-blur-sm border border-border/30 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-semibold mt-0 mb-3 text-foreground">Adult Content Storage</h2>
          <div className="border-t border-border/20 mb-4" />
          <p className="text-muted-foreground leading-relaxed">
            The Service generates and stores adult-oriented conversational and visual content
            featuring fictional adult characters. We take additional precautions with this content:
          </p>
          <ul className="mt-3 space-y-2 text-muted-foreground leading-relaxed list-disc pl-5">
            <li>
              <strong>Private storage:</strong> All generated images are stored in a private
              object storage bucket with access restricted to time-limited signed URLs. Content
              is not publicly indexable or accessible without authentication.
            </li>
            <li>
              <strong>No third-party scanning:</strong> We deliberately avoid CDN providers and
              image hosts that perform automated content moderation scanning on stored media.
            </li>
            <li>
              <strong>Not used for training:</strong> Your conversations and generated content
              are not used to train third-party AI models or shared with other users.
            </li>
            <li>
              <strong>Deletion rights:</strong> You may permanently delete your conversation
              history and generated images at any time through your account settings. Deletion
              is irreversible.
            </li>
          </ul>
        </section>

        {/* Data Retention */}
        <section className="bg-card/40 backdrop-blur-sm border border-border/30 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-semibold mt-0 mb-3 text-foreground">Data Retention</h2>
          <div className="border-t border-border/20 mb-4" />
          <p className="text-muted-foreground leading-relaxed">
            We retain your personal information for as long as your account is active or as
            needed to provide you with the Service. If you delete your account, we will delete
            or anonymize your personal information within 30 days, except as necessary to
            comply with legal obligations, resolve disputes, or enforce our agreements. Chat
            histories and user content associated with a deleted account are permanently
            removed.
          </p>
        </section>

        {/* Your Rights */}
        <section className="bg-card/40 backdrop-blur-sm border border-border/30 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-semibold mt-0 mb-3 text-foreground">Your Rights</h2>
          <div className="border-t border-border/20 mb-4" />
          <p className="text-muted-foreground leading-relaxed">
            Depending on your jurisdiction, you may have the following rights regarding your
            personal information:
          </p>
          <ul className="mt-3 space-y-2 text-muted-foreground leading-relaxed list-disc pl-5">
            <li>
              <strong>Access:</strong> You can request a copy of the personal information we
              hold about you.
            </li>
            <li>
              <strong>Correction:</strong> You can ask us to correct inaccurate or incomplete
              data.
            </li>
            <li>
              <strong>Deletion:</strong> You can request that we delete your personal
              information, subject to certain exceptions.
            </li>
            <li>
              <strong>Data Portability:</strong> You can request a copy of your data in a
              structured, machine-readable format.
            </li>
            <li>
              <strong>Objection / Restriction:</strong> You can object to or request
              restriction of certain processing activities.
            </li>
          </ul>
          <p className="text-muted-foreground leading-relaxed mt-3">
            To exercise any of these rights, please contact us at{' '}
            <a href="mailto:privacy@soulmateai.shop" className="text-primary hover:underline">
              privacy@soulmateai.shop
            </a>
            . We will respond to your request within 30 days.
          </p>
        </section>

        {/* Cookies */}
        <section className="bg-card/40 backdrop-blur-sm border border-border/30 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-semibold mt-0 mb-3 text-foreground">Cookies</h2>
          <div className="border-t border-border/20 mb-4" />
          <p className="text-muted-foreground leading-relaxed">
            We use only essential cookies that are necessary for the operation of the Service.
            These include session cookies to keep you logged in and security cookies to protect
            against fraud. We do not use tracking cookies, advertising cookies, or third-party
            analytics cookies that require consent. You can configure your browser to block or
            alert you about cookies, but some parts of the Service may not function properly
            without them.
          </p>
        </section>

        {/* Children */}
        <section className="bg-card/40 backdrop-blur-sm border border-border/30 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-semibold mt-0 mb-3 text-foreground">Children</h2>
          <div className="border-t border-border/20 mb-4" />
          <p className="text-muted-foreground leading-relaxed">
            The Service is not intended for individuals under the age of 18. We do not
            knowingly collect personal information from children under 18. If we learn that we
            have collected personal information from a child under 18, we will take steps to
            delete that information as soon as possible. If you believe we may have collected
            information from a child under 18, please contact us immediately.
          </p>
        </section>

        {/* Changes to Policy */}
        <section className="bg-card/40 backdrop-blur-sm border border-border/30 rounded-xl p-6 mb-8">
          <h2 className="text-xl font-semibold mt-0 mb-3 text-foreground">Changes to This Policy</h2>
          <div className="border-t border-border/20 mb-4" />
          <p className="text-muted-foreground leading-relaxed">
            We may update this Privacy Policy from time to time. If we make material changes,
            we will notify you by email (if you have provided one) or through a prominent
            notice on the Service prior to the change becoming effective. We encourage you to
            review this page periodically for the latest information on our privacy practices.
            Your continued use of the Service after any changes constitutes your acceptance of
            the updated policy.
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
