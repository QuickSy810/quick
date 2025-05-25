import mangoose from 'mongoose';

export const connectDB = async () => {
    try {
        const conn = await mangoose.connect(process.env.MANGO_URI);
        console.log('MongoDB connected successfully:', conn.connection.host);
    }catch (error) {
        console.error('Error connecting to MongoDB:', error.message);
        process.exit(1); 
    }

}