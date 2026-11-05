import {
  isURL,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';

// An image uploaded through POST /uploads, served from this API.
const UPLOADED_IMAGE = /^\/api\/v1\/uploads\/[0-9a-f-]{36}$/i;

export const isImageUrl = (value: unknown) =>
  typeof value === 'string' &&
  value.length <= 2048 &&
  (UPLOADED_IMAGE.test(value) ||
    isURL(value, { protocols: ['https'], require_protocol: true }));

// An image the store can show: one uploaded through POST /uploads (/api/v1/uploads/<id>),
// or an https link to another site.
export const IsImageUrl =
  (options: ValidationOptions = {}) =>
  (target: object, propertyName: string) =>
    registerDecorator({
      name: 'isImageUrl',
      target: target.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be an uploaded image URL or an https link`,
        ...options,
      },
      validator: { validate: isImageUrl },
    });
