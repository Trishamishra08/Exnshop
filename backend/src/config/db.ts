import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const connectDB = async (): Promise<void> => {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI or MONGO_URI is not defined in environment variables');
  }

  mongoose.set('autoIndex', false);
  const conn = await mongoose.connect(mongoUri);

  console.log('\n\x1b[32m✓\x1b[0m \x1b[1mMongoDB Connected Successfully\x1b[0m');
  console.log(`   \x1b[36mHost:\x1b[0m ${conn.connection.host}`);
  console.log(`   \x1b[36mDatabase:\x1b[0m ${conn.connection.name}\n`);
};

export default connectDB;




