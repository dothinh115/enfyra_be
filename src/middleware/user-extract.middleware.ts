import { NextFunction, Request } from 'express';
import * as jwt from 'jsonwebtoken';

export const userExporterMiddleware = (
  req: Request & { user?: any },
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers['authorization'];

  if (authHeader && typeof authHeader === 'string') {
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    try {
      const decoded = jwt.decode(token); // chỉ decode, không verify
      if (decoded && typeof decoded === 'object') {
        req.user = decoded;
      }
    } catch (err) {
      // Không throw lỗi — nếu decode sai thì bỏ qua
    }
  }

  next();
};
