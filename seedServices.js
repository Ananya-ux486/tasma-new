import dotenv from 'dotenv';
import { connectDb, closeDb } from './backend/db.js';
import { Service } from './backend/models/Service.js';

// Load environment variables
dotenv.config();

const services = [
    {
        slug: 'web-development',
        title: 'Web Development',
        tagline: 'Modern, responsive websites',
        indiaPrice: '₹25,000',
        foreignPrice: '$300',
        published: true,
        pricingType: 'fixed',
        order: 1
    },
    {
        slug: 'seo-services',
        title: 'Search Engine Optimization',
        tagline: 'Improve your search rankings',
        indiaPrice: '₹15,000',
        foreignPrice: '$180',
        published: true,
        pricingType: 'fixed',
        order: 2
    },
    {
        slug: 'social-media',
        title: 'Social Media Management',
        tagline: 'Build your social presence',
        indiaPrice: '₹12,000',
        foreignPrice: '$150',
        published: true,
        pricingType: 'fixed',
        order: 3
    },
    {
        slug: 'digital-marketing',
        title: 'Digital Marketing',
        tagline: 'Result-driven marketing solutions',
        indiaPrice: '₹20,000',
        foreignPrice: '$250',
        published: true,
        pricingType: 'fixed',
        order: 4
    },
    {
        slug: 'it-support',
        title: 'IT Support & Solutions',
        tagline: 'Reliable technical support',
        indiaPrice: '₹18,000',
        foreignPrice: '$220',
        published: true,
        pricingType: 'fixed',
        order: 5
    }
];

async function seedServices() {
    try {
        await connectDb(process.env.MONGODB_URI);
        console.log('🌱 Seeding services...');
        
        // Clear existing services
        await Service.deleteMany({});
        console.log('🗑️ Cleared existing services');
        
        // Insert new services
        const result = await Service.insertMany(services);
        console.log(`✅ Seeded ${result.length} services successfully!`);
        
        // List seeded services
        result.forEach(service => {
            console.log(`   - ${service.title} (${service.slug})`);
        });
        
    } catch (error) {
        console.error('❌ Error seeding services:', error);
    } finally {
        await closeDb();
    }
}

seedServices();