import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function migrate() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI not found');
  }

  console.log('Connecting to MongoDB cluster...');
  await mongoose.connect(uri);

  const client = mongoose.connection.client;
  const dbTest = client.db('test');
  const dbExn = client.db('exnshop');

  const collections = await dbTest.listCollections().toArray();
  console.log(`Found ${collections.length} collections in 'test' database.`);

  for (const coll of collections) {
    const collName = coll.name;
    const testColl = dbTest.collection(collName);
    const exnColl = dbExn.collection(collName);

    const docs = await testColl.find({}).toArray();
    console.log(`[${collName}] test has ${docs.length} documents.`);

    if (docs.length === 0) continue;

    // Drop and re-insert into exnshop to ensure an exact replica
    try {
      await exnColl.deleteMany({});
      const result = await exnColl.insertMany(docs);
      console.log(`  -> Copied ${result.insertedCount} documents into exnshop.${collName}`);
    } catch (err: any) {
      console.error(`  -> Error copying ${collName}:`, err.message);
    }

    // Copy indexes
    try {
      const indexes = await testColl.indexes();
      for (const idx of indexes) {
        if (idx.name === '_id_') continue;
        const keys = idx.key;
        const options: any = { name: idx.name };
        if (idx.unique) options.unique = true;
        if (idx.sparse) options.sparse = true;
        await exnColl.createIndex(keys, options);
      }
      console.log(`  -> Copied indexes for ${collName}`);
    } catch (idxErr: any) {
      console.warn(`  -> Note on indexes for ${collName}:`, idxErr.message);
    }
  }

  console.log('\nMigration complete! Verifying counts in exnshop database:');
  const exnCollections = await dbExn.listCollections().toArray();
  for (const c of exnCollections) {
    const count = await dbExn.collection(c.name).countDocuments();
    console.log(`exnshop.${c.name}: ${count}`);
  }

  const appSettings = await dbExn.collection('appsettings').findOne();
  console.log('\nFinal exnshop estimatedDeliveryTime:', appSettings?.estimatedDeliveryTime);

  await mongoose.disconnect();
  console.log('Done!');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
