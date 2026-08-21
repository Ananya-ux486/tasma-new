import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema({
    slug: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
    },
    title: { type: String, required: true, trim: true },
    tagline: { type: String, default: "" },
    description: { type: String, default: "" },
    indiaPrice: { type: String, default: "" },
    foreignPrice: { type: String, default: "" },
    pricingType: {
        type: String,
        enum: ["", "fixed", "custom"],
        default: "fixed",
    },
    published: { type: Boolean, default: true, index: true },
    order: { type: Number, default: 0 },
}, { 
    timestamps: true 
});

export const Service = mongoose.model('Service', serviceSchema);