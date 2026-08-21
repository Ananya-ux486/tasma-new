import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema({
    reference: { type: String, required: true, unique: true, index: true },
    provider: {
        type: String,
        required: true,
        enum: ["razorpay"],
        index: true,
    },
    status: {
        type: String,
        required: true,
        enum: ["created", "pending", "paid", "failed", "cancelled"],
        default: "created",
        index: true,
    },
    amountMinor: { type: Number, required: true, min: 1 },
    currency: { type: String, required: true, uppercase: true, trim: true },
    displayAmount: { type: String, required: true },
    serviceTitle: { type: String, required: true },
    customer: {
        name: { type: String, required: true },
        email: { type: String, required: true, index: true },
        phone: { type: String, default: "" },
    },
    providerOrderId: { type: String, default: "", index: true },
    providerPaymentId: { type: String, default: "", index: true },
    providerSessionId: { type: String, default: "", index: true },
    receiptUrl: { type: String, default: "" },
    failureCode: { type: String, default: "" },
    failureMessage: { type: String, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    paidAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
}, { 
    timestamps: true 
});

paymentSchema.index({ createdAt: -1 });

export const Payment = mongoose.model('Payment', paymentSchema);