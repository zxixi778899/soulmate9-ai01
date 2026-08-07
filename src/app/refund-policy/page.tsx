import Link from 'next/link';

export default function RefundPolicyPage() {
  const legalEntity = process.env.LEGAL_ENTITY_NAME || 'Oxmate AI';
  const supportEmail = process.env.LEGAL_CONTACT_EMAIL || 'support@oxmate-ai.com';
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
            Refund Policy
          </h1>
          <p className="mt-3 text-muted-foreground leading-relaxed max-w-xl mx-auto">
            Please read this policy carefully before making a purchase. All payments on{' '}
            {legalEntity} are processed in cryptocurrency, which affects how refunds work.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Last updated: August 5, 2026
          </p>
        </div>

        {/* Payment method */}
        <section className="bg-card/40 backdrop-blur-sm border border-border/30 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-semibold mt-0 mb-3 text-foreground">1. Crypto-Only Payments</h2>
          <div className="border-t border-border/20 mb-4" />
          <p className="text-muted-foreground leading-relaxed mb-3">
            All purchases — membership subscriptions and credit top-ups — are settled
            exclusively in USDT on the TRC-20 network. We do not currently accept credit
            cards, debit cards, or any other payment method.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Cryptocurrency transactions are irreversible on the blockchain once confirmed.
            Unlike card payments, crypto payments cannot be charged back or reversed by a
            bank. Refunds, when approved under this policy, are issued by us voluntarily
            and always in USDT.
          </p>
        </section>

        {/* Subscriptions */}
        <section className="bg-card/40 backdrop-blur-sm border border-border/30 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-semibold mt-0 mb-3 text-foreground">2. Membership Subscriptions</h2>
          <div className="border-t border-border/20 mb-4" />
          <p className="text-muted-foreground leading-relaxed mb-3">
            Membership benefits (higher daily message limits, more companions, monthly
            credits, and premium features) activate immediately upon payment confirmation.
            Because the service is digital and takes effect instantly, subscription
            purchases are <strong className="text-foreground">non-refundable once any paid
            benefit has been used</strong> — for example, once messages beyond the free
            tier have been sent, monthly credits have been spent, or premium features have
            been accessed.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            If you have not used any paid benefit at all, you may request a refund within
            7 days of purchase. We review such requests case by case and reserve the right
            to verify account activity before approving.
          </p>
        </section>

        {/* Credits */}
        <section className="bg-card/40 backdrop-blur-sm border border-border/30 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-semibold mt-0 mb-3 text-foreground">3. Credit Top-Ups</h2>
          <div className="border-t border-border/20 mb-4" />
          <p className="text-muted-foreground leading-relaxed mb-3">
            Credits are consumed when you generate images, HD upgrades, voice messages, or
            videos. <strong className="text-foreground">Consumed credits are
            non-refundable</strong>, as the corresponding GPU and model costs have already
            been incurred.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            A completely unused credit top-up may be considered for a refund within 7 days
            of purchase, subject to verification that no credits from that purchase have
            been spent.
          </p>
        </section>

        {/* How refunds are issued */}
        <section className="bg-card/40 backdrop-blur-sm border border-border/30 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-semibold mt-0 mb-3 text-foreground">4. How Approved Refunds Are Issued</h2>
          <div className="border-t border-border/20 mb-4" />
          <p className="text-muted-foreground leading-relaxed mb-3">
            Approved refunds are sent in USDT (TRC-20) to the wallet address the original
            payment was sent from. Blockchain network fees incurred by the refund transfer
            are deducted from the refunded amount.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Refunds are typically processed within 5–10 business days after approval.
            Please double-check the receiving wallet address with our support team before
            the transfer is executed — crypto transfers to an incorrect address cannot be
            recovered.
          </p>
        </section>

        {/* Non-refundable */}
        <section className="bg-card/40 backdrop-blur-sm border border-border/30 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-semibold mt-0 mb-3 text-foreground">5. Situations Where Refunds Are Denied</h2>
          <div className="border-t border-border/20 mb-4" />
          <p className="text-muted-foreground leading-relaxed mb-3">
            Refund requests will be denied where the purchased benefits have already been
            consumed, where the request is made later than 7 days after purchase, where the
            account has violated our Terms of Service, or where we reasonably suspect fraud
            or abuse of the refund process.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Change of mind after using the service is not, by itself, grounds for a refund.
            We encourage you to try the free plan (40 messages per day, free companions)
            before purchasing any subscription or credits.
          </p>
        </section>

        {/* How to request */}
        <section className="bg-card/40 backdrop-blur-sm border border-border/30 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-semibold mt-0 mb-3 text-foreground">6. How to Request a Refund</h2>
          <div className="border-t border-border/20 mb-4" />
          <p className="text-muted-foreground leading-relaxed mb-3">
            To request a refund, email{' '}
            <a href={`mailto:${supportEmail}`} className="text-primary hover:underline">
              {supportEmail}
            </a>{' '}
            with the following information:
          </p>
          <ul className="list-disc pl-6 text-muted-foreground leading-relaxed space-y-1.5">
            <li>The email address of your account</li>
            <li>The product purchased (membership plan or credit pack) and the purchase date</li>
            <li>The USDT transaction ID (TXID) of your payment</li>
            <li>A brief reason for the request</li>
          </ul>
          <p className="text-muted-foreground leading-relaxed mt-3">
            We aim to respond to all refund requests within 48 hours.
          </p>
        </section>

        {/* Contact */}
        <section className="bg-card/40 backdrop-blur-sm border border-border/30 rounded-xl p-6 mb-6">
          <h2 className="text-xl font-semibold mt-0 mb-3 text-foreground">7. Contact</h2>
          <div className="border-t border-border/20 mb-4" />
          <p className="text-muted-foreground leading-relaxed">
            Questions about this Refund Policy can be sent to{' '}
            <a href={`mailto:${supportEmail}`} className="text-primary hover:underline">
              {supportEmail}
            </a>
            . This policy forms part of our Terms of Service and may be updated from time to
            time; the version in effect is the one published on this page at the time of
            your purchase.
          </p>
        </section>

        {/* Footer nav */}
        <div className="flex flex-wrap items-center justify-center gap-6 pt-4 text-sm text-muted-foreground">
          <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
          <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
          <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
        </div>
      </div>
    </div>
  );
}
