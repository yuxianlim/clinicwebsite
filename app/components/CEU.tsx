'use client';

import { useState, type FormEvent } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { CardElement, Elements, useStripe, useElements } from '@stripe/react-stripe-js';
import { recordAuditEvent } from '@/app/lib/auditLog';

type Topic = {
  id: string;
  title: string;
  summary: string;
  price: string;
};

type PaymentValues = {
  name: string;
  email: string;
};

const topics: Topic[] = [
  {
    id: 'fall-prevention',
    title: 'Fall Prevention',
    summary: 'Learn practical screening and prevention strategies to reduce fall risk in older adults.',
    price: '$95',
  },
  {
    id: 'women-health',
    title: 'Women Health',
    summary: 'Explore evidence-based approaches for women’s wellness, hormone support, and preventive care.',
    price: '$105',
  },
  {
    id: 'children-health',
    title: 'Children Health',
    summary: 'Discover child-centered care principles that support growth, development, and everyday wellness.',
    price: '$90',
  },
];

const initialPaymentValues: PaymentValues = {
  name: '',
  email: '',
};

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

const PaymentForm = ({
  selectedTopicData,
}: {
  selectedTopicData: Topic;
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [paymentValues, setPaymentValues] = useState<PaymentValues>(initialPaymentValues);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handlePaymentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPaymentValues((prev) => ({ ...prev, [name]: value }));
  };

  const handlePaymentSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!stripe || !elements) {
      setStatusMessage('Stripe is still loading. Please try again in a moment.');
      return;
    }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setStatusMessage('Card input could not be loaded.');
      return;
    }

    setIsLoading(true);
    setStatusMessage(null);

    try {
      const response = await fetch('/api/stripe/payment_intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicId: selectedTopicData.id }),
      });

      const data = await response.json();
      if (!response.ok || !data.clientSecret) {
        setStatusMessage(data.error || 'Unable to create payment intent.');
        return;
      }

      const result = await stripe.confirmCardPayment(data.clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            name: paymentValues.name,
            email: paymentValues.email,
          },
        },
      });

      if (result.error) {
        void recordAuditEvent({
          module: 'payments',
          action: 'CEU payment failed',
          relatedRecordId: selectedTopicData.id,
          result: 'failed',
        });
        setStatusMessage(result.error.message ?? 'Payment failed. Please try again.');
        return;
      }

      if (result.paymentIntent?.status === 'succeeded') {
        void recordAuditEvent({
          module: 'payments',
          action: 'CEU payment succeeded',
          relatedRecordId: selectedTopicData.id,
          result: 'success',
        });
        void recordAuditEvent({
          module: 'ceu',
          action: 'CEU enrollment reported',
          relatedRecordId: selectedTopicData.id,
          result: 'success',
        });
        setStatusMessage('Payment succeeded! Your registration is confirmed.');
        setPaymentValues(initialPaymentValues);
        elements.getElement(CardElement)?.clear();
      } else {
        void recordAuditEvent({
          module: 'payments',
          action: 'CEU payment pending',
          relatedRecordId: selectedTopicData.id,
          result: 'pending',
        });
        setStatusMessage('Payment is still processing. Check your payment status before trying again.');
      }
    } catch {
      void recordAuditEvent({
        module: 'payments',
        action: 'CEU payment outcome unknown',
        relatedRecordId: selectedTopicData.id,
        result: 'failed',
      });
      setStatusMessage('The payment outcome could not be confirmed. Check your payment status before trying again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8">
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#556B42]">Payment Form</p>
        <h3 className="text-2xl font-semibold text-[#556B42] mt-2">Register for {selectedTopicData.title}</h3>
        <p className="text-[#556B42]/80 mt-2">Complete your payment to reserve your seat in this CEU session.</p>
      </div>

      <form onSubmit={handlePaymentSubmit} className="grid gap-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[#556B42] mb-2" htmlFor="name">Full name</label>
            <input
              id="name"
              name="name"
              value={paymentValues.name}
              onChange={handlePaymentChange}
              required
              className="w-full border border-[#d9dfcf] rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#556B42]"
              placeholder="Your name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#556B42] mb-2" htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              value={paymentValues.email}
              onChange={handlePaymentChange}
              required
              className="w-full border border-[#d9dfcf] rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#556B42]"
              placeholder="you@example.com"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#556B42] mb-2">Card details</label>
          <div className="border border-[#d9dfcf] rounded-lg p-3 bg-white">
            <CardElement options={{ hidePostalCode: true }} />
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-[#556B42] text-white py-3 rounded-lg font-semibold hover:opacity-90 transition-colors disabled:opacity-60"
        >
          {isLoading ? 'Processing…' : `Pay ${selectedTopicData.price}`}
        </button>

        {statusMessage && <p className="text-sm text-[#556B42] font-medium">{statusMessage}</p>}
      </form>
    </div>
  );
};

const CEU = () => {
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

  const selectedTopicData = topics.find((topic) => topic.id === selectedTopic);

  return (
    <section id="ceu" className="scroll-mt-24 bg-[#f7f3e8] py-20 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-10 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#556B42] mb-3">CEU / Continuing Education</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-[#556B42] mb-4">Choose a CEU topic and continue to payment</h2>
          <p className="text-lg text-[#556B42]/80 leading-8">
            Select one of our featured learning tracks to register for an upcoming educational session and complete your secure payment.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-10">
          {topics.map((topic) => (
            <div key={topic.id} className="bg-white rounded-2xl shadow-lg p-6 flex flex-col h-full">
              <div className="mb-4">
                <h3 className="text-xl font-semibold text-[#556B42] mb-2">{topic.title}</h3>
                <p className="text-[#556B42]/80 leading-7">{topic.summary}</p>
              </div>
              <div className="mt-auto flex items-center justify-between pt-4 border-t border-[#e8ebdf]">
                <span className="text-sm font-semibold text-[#556B42]">{topic.price}</span>
                <button
                  type="button"
                  onClick={() => setSelectedTopic(topic.id)}
                  className="bg-[#556B42] text-white px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-colors"
                >
                  Register
                </button>
              </div>
            </div>
          ))}
        </div>

        {selectedTopicData && (
          <Elements stripe={stripePromise}>
            <PaymentForm selectedTopicData={selectedTopicData} />
          </Elements>
        )}
      </div>
    </section>
  );
};

export default CEU;
