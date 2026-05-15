import {
  BlobServiceClient,
  StorageSharedKeyCredential,
} from '@azure/storage-blob';
import * as sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { extname } from 'path';

export async function uploadToAzureStorage(
  // file: Express.Multer.File,
  file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  },
): Promise<string> {
  const accountName = process.env.AZURE_ACCT_NAME;
  const accountKey = process.env.AZURE_ACCT_KEY;
  const containerName = process.env.AZURE_CONTAINER_NAME;

  if (!accountName || !accountKey || !containerName) {
    throw new Error(
      'Azure storage environment variables are not properly set.',
    );
  }

  const sharedKeyCredential = new StorageSharedKeyCredential(
    accountName,
    accountKey,
  );

  const blobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    sharedKeyCredential,
  );

  const containerClient = blobServiceClient.getContainerClient(containerName);

  const compressedBuffer = await sharp(file.buffer)
    .resize({ width: 800 })
    .jpeg({ quality: 60 })
    .toBuffer();

  const blobName = `${uuidv4()}.jpeg`;
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);

  await blockBlobClient.uploadData(compressedBuffer, {
    blobHTTPHeaders: { blobContentType: 'image/jpeg' },
  });

  return blockBlobClient.url;
}

export async function uploadDocumentToAzure(
  // file: Express.Multer.File,
  file: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
  },
  blobPath: string,
): Promise<string> {
  const accountName = process.env.AZURE_ACCT_NAME;
  const accountKey = process.env.AZURE_ACCT_KEY;
  const containerName = process.env.AZURE_CONTAINER_NAME;

  if (!accountName || !accountKey || !containerName) {
    throw new Error(
      'Azure storage environment variables are not properly set.',
    );
  }

  const sharedKeyCredential = new StorageSharedKeyCredential(
    accountName,
    accountKey,
  );
  const blobServiceClient = new BlobServiceClient(
    `https://${accountName}.blob.core.windows.net`,
    sharedKeyCredential,
  );

  const containerClient = blobServiceClient.getContainerClient(containerName);

  // Use original file buffer
  const bufferToUpload = file.buffer;

  // Determine MIME type from file extension
  let contentType = 'application/octet-stream';
  const ext = extname(file.originalname).toLowerCase();

  switch (ext) {
    case '.pdf':
      contentType = 'application/pdf';
      break;
    case '.doc':
      contentType = 'application/msword';
      break;
    case '.docx':
      contentType =
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      break;
    case '.txt':
      contentType = 'text/plain';
      break;
    case '.jpg':
    case '.jpeg':
      contentType = 'image/jpeg';
      break;
    case '.png':
      contentType = 'image/png';
      break;
    // add more as needed
  }

  const blockBlobClient = containerClient.getBlockBlobClient(blobPath);

  await blockBlobClient.uploadData(bufferToUpload, {
    blobHTTPHeaders: { blobContentType: contentType },
  });

  return blockBlobClient.url;
}
