import express from 'express';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { Payment } from '../models/Payment.js';
import { Service } from '../models/Service.js';

const router = express.Router();

// Helper functions
function clean(value, max = 250) {
    return String(value || '').trim().slice(0, max);
}

function reference() {
    return `TF-${Date.now()}-${crypto.randomBytes(10).toString('hex').toUpperCase()}`;
}

function parseCustomInrAmount(value) {
    const normalized = String(value ?? '').trim().replace(/,/g, '');
    const match = normalized.match(/^(\d{1,7})(?:\.(\d{1,2}))?$/);
    if (!match) {
        throw Object.assign(
            new Error('Enter a valid INR amount with no more than two decimal places.'),
            { status: 400 }
        );
    }

    const amountMinor =
        Number.parseInt(match[1], 10) * 100 +
        Number.parseInt((match[2] || '').padEnd(2, '0') || '0', 10);
    
    if (
        !Number.isSafeInteger(amountMinor) ||
        amountMinor < 100 ||
        amountMinor > 100_000_000
    ) {
        throw Object.assign(
            new Error('Custom amount must be between ₹1 and ₹10,00,000.'),
            { status: 400 }
        );
    }

    return {
        amountMinor,
        displayAmount: `₹${(amountMinor / 100).toLocaleString('en-IN', {
            minimumFractionDigits: amountMinor % 100 ? 2 : 0,
            maximumFractionDigits: 2,
        })}`,
    };
}

function isTestProvider() {
    return String(process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_test_');
}

// GET /api/payments/config
router.get('/config', (req, res) => {
    return res.json({
        providers: {
            razorpay: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
        },
        currencies: {
            razorpay: 'INR',
        },
    });
});

// GET /api/payments/packages
router.get('/packages', async (req, res) => {
    try {
        const items = await Service.find({ published: true, pricingType: 'fixed' })
            .sort({ order: 1, title: 1 })
            .select('slug title tagline indiaPrice foreignPrice')
            .lean();
        return res.json({ items });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to fetch packages' });
    }
});

// POST /api/payments/create
router.post('/create', async (req, res) => {
    try {
        const provider = 'razorpay';
        const currency = 'INR';
        const paymentType = clean(req.body?.paymentType, 20).toLowerCase();
        
        let checkout;
        
        if (paymentType === 'custom') {
            // Custom payment
            const money = parseCustomInrAmount(req.body?.customAmount);
            checkout = {
                provider,
                currency,
                ...money,
                serviceTitle: 'Custom payment',
                metadata: {
                    customPayment: true,
                    enteredAmountMajor: (money.amountMinor / 100).toFixed(2),
                },
            };
        } else {
            // Service package payment
            const serviceSlug = clean(req.body?.serviceSlug, 100).toLowerCase();
            const service = await Service.findOne({
                slug: serviceSlug,
                published: true,
                pricingType: 'fixed',
            }).lean();
            
            if (!service) {
                return res.status(400).json({ error: 'Select a valid service package.' });
            }
            
            const priceStr = service.indiaPrice;
            const amount = parseFloat(priceStr.replace(/[^\d.]/g, ''));
            
            if (!amount || amount <= 0) {
                return res.status(400).json({ error: 'This package has no valid price.' });
            }
            
            checkout = {
                provider,
                currency,
                amountMinor: Math.round(amount * 100),
                displayAmount: `₹${amount.toLocaleString('en-IN')}`,
                serviceTitle: service.title,
                metadata: {},
            };
        }

        const customer = {
            name: clean(req.body?.name, 120),
            email: clean(req.body?.email, 120),
            phone: clean(req.body?.phone, 30),
        };

        if (customer.name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
            return res.status(400).json({ error: 'Valid name and email are required.' });
        }

        const ref = reference();
        const payment = await Payment.create({
            reference: ref,
            provider: checkout.provider,
            status: 'created',
            amountMinor: checkout.amountMinor,
            currency: checkout.currency,
            displayAmount: checkout.displayAmount,
            serviceTitle: checkout.serviceTitle,
            customer,
            metadata: {
                ...(checkout.metadata || {}),
                testMode: isTestProvider(),
            },
        });

        // Create Razorpay order
        const razorpay = new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });

        const order = await razorpay.orders.create({
            amount: checkout.amountMinor,
            currency: checkout.currency,
            receipt: ref,
            notes: {
                reference: ref,
                service: checkout.serviceTitle,
            },
        });

        payment.providerOrderId = order.id;
        payment.status = 'pending';
        await payment.save();

        return res.json({
            kind: 'razorpay',
            reference: ref,
            keyId: process.env.RAZORPAY_KEY_ID,
            orderId: order.id,
            amount: checkout.amountMinor,
            currency: checkout.currency,
            name: 'TasmaFive Solutions',
            description: checkout.serviceTitle,
            customer,
        });
    } catch (error) {
        console.error('Payment create error:', error);
        return res.status(error.status || 500).json({ 
            error: error.status ? error.message : 'Unable to start payment.' 
        });
    }
});

// POST /api/payments/razorpay/verify
router.post('/razorpay/verify', async (req, res) => {
    try {
        if (!process.env.RAZORPAY_KEY_SECRET?.trim()) {
            return res.status(503).json({ error: 'Payment verification is unavailable.' });
        }

        const orderId = clean(req.body?.razorpay_order_id, 120);
        const paymentId = clean(req.body?.razorpay_payment_id, 120);
        const signature = clean(req.body?.razorpay_signature, 300);
        const referenceValue = clean(req.body?.reference, 120);

        // Verify signature
        const expected = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${orderId}|${paymentId}`)
            .digest('hex');

        if (
            !signature ||
            signature.length !== expected.length ||
            !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
        ) {
            await Payment.findOneAndUpdate(
                { reference: referenceValue },
                { status: 'failed', failureMessage: 'Invalid Razorpay signature.' }
            );
            return res.status(400).json({ error: 'Payment verification failed.' });
        }

        const payment = await Payment.findOne({
            reference: referenceValue,
            providerOrderId: orderId,
            provider: 'razorpay',
        });

        if (!payment) {
            return res.status(404).json({ error: 'Payment record not found.' });
        }

        try {
            const razorpay = new Razorpay({
                key_id: process.env.RAZORPAY_KEY_ID,
                key_secret: process.env.RAZORPAY_KEY_SECRET,
            });

            let providerPayment = await razorpay.payments.fetch(paymentId);

            if (providerPayment.status === 'authorized') {
                providerPayment = await razorpay.payments.capture(
                    paymentId,
                    payment.amountMinor,
                    payment.currency
                );
            }

            if (
                providerPayment.status !== 'captured' ||
                providerPayment.order_id !== orderId ||
                Number(providerPayment.amount) !== payment.amountMinor ||
                providerPayment.currency !== payment.currency
            ) {
                throw new Error('Provider amount, currency or capture status did not match.');
            }

            payment.status = 'paid';
            payment.providerPaymentId = paymentId;
            payment.paidAt = new Date();
            await payment.save();
        } catch (error) {
            payment.status = 'failed';
            payment.failureMessage = clean(error.message, 500);
            await payment.save();
            return res.status(400).json({ error: 'Payment could not be confirmed.' });
        }

        return res.json({ ok: true, reference: payment.reference });
    } catch (error) {
        console.error('Payment verify error:', error);
        return res.status(500).json({ error: 'Payment verification failed.' });
    }
});

// POST /api/payments/webhooks/razorpay
router.post('/webhooks/razorpay', async (req, res) => {
    try {
        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
        if (!webhookSecret) {
            return res.status(503).json({ error: 'Webhook is not configured.' });
        }

        const signature = clean(req.headers['x-razorpay-signature'], 300);
        const expected = crypto
            .createHmac('sha256', webhookSecret)
            .update(JSON.stringify(req.body))
            .digest('hex');

        if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
            return res.status(400).json({ error: 'Invalid webhook signature.' });
        }

        const event = req.body;
        if (event.event === 'payment.captured' || event.event === 'payment.failed') {
            const payment = await Payment.findOne({ 
                providerPaymentId: event.payload.payment.entity.id 
            });
            
            if (payment) {
                payment.metadata = {
                    ...(payment.metadata || {}),
                    razorpayEvent: event.event,
                };
                
                if (event.event === 'payment.captured') {
                    payment.status = 'paid';
                    payment.paidAt = new Date();
                } else if (event.event === 'payment.failed') {
                    payment.status = 'failed';
                    payment.failureMessage = 'Payment failed at gateway';
                }
                
                await payment.save();
            }
        }

        return res.json({ received: true });
    } catch (error) {
        console.error('Razorpay webhook error:', error);
        return res.status(400).json({ error: 'Webhook processing failed.' });
    }
});

// GET /api/payments/status/:reference
router.get('/status/:reference', async (req, res) => {
    try {
        const payment = await Payment.findOne({
            reference: clean(req.params.reference, 120),
        })
        .select('reference provider status displayAmount currency serviceTitle paidAt createdAt')
        .lean();

        if (!payment) {
            return res.status(404).json({ error: 'Payment not found.' });
        }

        return res.json({ payment });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to fetch payment status.' });
    }
});

export default router;