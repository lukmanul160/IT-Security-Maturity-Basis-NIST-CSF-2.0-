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
        openRead: async key => (await send(GetObjectCommand, key)).Body,
        putFile: async (key, sourcePath, mimeType) => {
          const fs = require('node:fs');
          const handle = await fs.promises.open(sourcePath, 'r');
          let uploadId;
          try {
            const size = (await handle.stat()).size;
            if (size === 0) return await send(PutObjectCommand, key, { Body: Buffer.alloc(0), ContentType: mimeType });
            uploadId = (await client.send(new (require('@aws-sdk/client-s3').CreateMultipartUploadCommand)({ Bucket: config.bucket, Key: key, ContentType: mimeType }))).UploadId;
            const parts = []; let position = 0;
            do {
              const buffer = Buffer.alloc(Math.min(Math.max(16 * 1024 * 1024, Math.ceil(size / 9999)), size - position));
              let bytes = 0;
              while (bytes < buffer.length) { const read = await handle.read(buffer, bytes, buffer.length - bytes, position + bytes); if (!read.bytesRead) throw new Error('Storage source changed'); bytes += read.bytesRead; }
              const PartNumber = parts.length + 1;
              const result = await client.send(new (require('@aws-sdk/client-s3').UploadPartCommand)({ Bucket: config.bucket, Key: key, UploadId: uploadId, PartNumber, Body: buffer }));
              parts.push({ PartNumber, ETag: result.ETag }); position += bytes;
            } while (position < size);
            await client.send(new (require('@aws-sdk/client-s3').CompleteMultipartUploadCommand)({ Bucket: config.bucket, Key: key, UploadId: uploadId, MultipartUpload: { Parts: parts } }));
          } catch (error) { if (uploadId) await client.send(new (require('@aws-sdk/client-s3').AbortMultipartUploadCommand)({ Bucket: config.bucket, Key: key, UploadId: uploadId })).catch(() => {}); throw error; }
          finally { await handle.close(); }
        },
        exists: async key => { try { await send(HeadObjectCommand, key); return true; } catch (error) { if (error.$metadata?.httpStatusCode === 404) return false; throw error; } },
        remove: key => send(DeleteObjectCommand, key),
      };
    }
    const { Storage } = require('@google-cloud/storage');
    const bucket = new Storage({ ...(config.projectId ? { projectId: config.projectId } : {}) }).bucket(config.bucket);
    return {
      put: (key, body, mimeType) => bucket.file(key).save(body, { resumable: false, contentType: mimeType }),
      read: async key => (await bucket.file(key).download())[0],
      openRead: async key => { await bucket.file(key).getMetadata(); return bucket.file(key).createReadStream(); },
      putFile: (key, sourcePath, mimeType) => require('node:stream/promises').pipeline(require('node:fs').createReadStream(sourcePath), bucket.file(key).createWriteStream({ resumable: true, metadata: { contentType: mimeType } })),
      exists: async key => (await bucket.file(key).exists())[0],
      remove: key => bucket.file(key).delete({ ignoreNotFound: true }),
    };
  }
  return { adapter };
}
module.exports = { createCloudStorageService };
