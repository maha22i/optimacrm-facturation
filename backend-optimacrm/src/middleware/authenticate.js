import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { ApiError } from '../utils/ApiError.js';

export async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization;
    const token = req.cookies?.token || (header?.startsWith('Bearer ') ? header.split(' ')[1] : null);

    if (!token) {
      throw ApiError.unauthorized('Access token required');
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const [userResult, permResult] = await Promise.all([
      query(
        'SELECT id, email, first_name, last_name, role, is_active FROM users WHERE id = $1',
        [decoded.userId],
      ),
      query(
        'SELECT permission FROM user_permissions WHERE user_id = $1',
        [decoded.userId],
      ),
    ]);

    if (userResult.rows.length === 0) {
      throw ApiError.unauthorized('User not found');
    }

    if (!userResult.rows[0].is_active) {
      throw ApiError.forbidden('Account is deactivated');
    }

    req.user = userResult.rows[0];
    req.user.permissions = permResult.rows.map(r => r.permission);
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') return next(ApiError.unauthorized('Invalid token'));
    if (error.name === 'TokenExpiredError') return next(ApiError.unauthorized('Token expired'));
    next(error);
  }
}
