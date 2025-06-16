import mongoose from 'mongoose';

const versionSchema = new mongoose.Schema({
  _id: String,
  platform: String,
  version: String,
  link: String
});

const Version = mongoose.model('Version', versionSchema);
export default Version;