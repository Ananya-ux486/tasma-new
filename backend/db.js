import mongoose from 'mongoose';

export async function connectDb(uri) {
    mongoose.set('strictQuery', true);
    await mongoose.connect(uri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5_000,
        socketTimeoutMS: 20_000,
        maxIdleTimeMS: 30_000,
    });
    console.log(`[db] Connected to database: ${mongoose.connection.name}`);
}

export async function closeDb() {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
}