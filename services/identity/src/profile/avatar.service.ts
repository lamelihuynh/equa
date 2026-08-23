import { CreateBucketCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { ApiException } from '../common/api.exception';
import { IdentityConfigService } from '../config/identity-config.service';

@Injectable()
export class AvatarService {
  private readonly client: S3Client;
  constructor(@Inject(IdentityConfigService) private readonly config: IdentityConfigService) {
    this.client = new S3Client({
      endpoint: config.s3Endpoint,
      region: config.s3Region,
      forcePathStyle: true,
      credentials: { accessKeyId: config.s3AccessKey, secretAccessKey: config.s3SecretKey },
    });
  }

  async upload(
    userId: string,
    file: { mimetype: string; toBuffer: () => Promise<Buffer> },
  ): Promise<string> {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
      throw new ApiException(
        'PROFILE_INVALID_AVATAR',
        'Avatar must be JPEG, PNG, or WebP.',
        HttpStatus.BAD_REQUEST,
      );
    const body = await file.toBuffer();
    if (body.length > 2 * 1024 * 1024)
      throw new ApiException(
        'PROFILE_INVALID_AVATAR',
        'Avatar must not exceed 2MB.',
        HttpStatus.BAD_REQUEST,
      );
    const extension = file.mimetype.split('/')[1] ?? 'bin';
    const key = `avatars/${userId}/${randomUUID()}.${extension}`;
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.config.avatarBucket }));
    } catch {
      /* Bucket already exists. */
    }
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.avatarBucket,
        Key: key,
        Body: body,
        ContentType: file.mimetype,
      }),
    );
    return key;
  }

  readUrl(key: string): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.config.avatarBucket, Key: key }),
      { expiresIn: 15 * 60 },
    );
  }
}
