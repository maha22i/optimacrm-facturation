import { ApiError } from '../utils/ApiError.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validate(schema) {
  return (req, _res, next) => {
    const errors = [];

    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field];
      const label = rules.label || field;

      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`${label} is required`);
        continue;
      }

      if (value === undefined || value === null || value === '') continue;

      if (rules.type === 'email' && !EMAIL_RE.test(value)) {
        errors.push(`${label} must be a valid email address`);
      }
      if (rules.minLength && String(value).length < rules.minLength) {
        errors.push(`${label} must be at least ${rules.minLength} characters`);
      }
      if (rules.maxLength && String(value).length > rules.maxLength) {
        errors.push(`${label} must be at most ${rules.maxLength} characters`);
      }
      if (rules.enum && !rules.enum.includes(value)) {
        errors.push(`${label} must be one of: ${rules.enum.join(', ')}`);
      }
      if (rules.type === 'boolean' && typeof value !== 'boolean') {
        errors.push(`${label} must be a boolean`);
      }
    }

    if (errors.length > 0) {
      return next(new ApiError(400, errors.join('. ')));
    }

    next();
  };
}
