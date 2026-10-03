// Credentials come from the server's SDK credential chain, never from browser settings.
function createCloudStorageService() {
  function adapter(config) {
    if (config.mode === 's3') {
      const { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
      const client = new S3Client({ region: config.region });
      const send = (Command, key, extra = {}) => client.send(new Command({ Bucket: config.bucket, Key: key, ...extra }));
      return {
        put: (key, body, mimeType) => send(PutObjectCommand, key, { Body: body, ContentType: mimeType }),
        read: async key => Buffer.from(await (await send(GetObjectCommand, key)).Body.transformToByteArray()),
        exists: async key => { try { await send(HeadObjectCommand, key); return true; } catch (error) { if (error.$metadata?.httpStatusCode === 404) return false; throw error; } },
        remove: key => send(DeleteObjectCommand, key),
      };
    }
    const { Storage } = require('@google-cloud/storage');
    const bucket = new Storage({ ...(config.projectId ? { projectId: config.projectId } : {}) }).bucket(config.bucket);
    return {
      put: (key, body, mimeType) => bucket.file(key).save(body, { resumable: false, contentType: mimeType }),
      read: async key => (await bucket.file(key).download())[0],
      exists: async key => (await bucket.file(key).exists())[0],
      remove: key => bucket.file(key).delete({ ignoreNotFound: true }),
    };
  }
  return { adapter };
}
module.exports = { createCloudStorageService };
