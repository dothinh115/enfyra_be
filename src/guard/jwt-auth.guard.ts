import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext) {
    const result = await super.canActivate(context);
    return result as boolean;
  }
  // Đè logic quăng lỗi mặc định của auth guard
  handleRequest(err: any, user: any, info: any, context: any, status?: any) {
    const req = context.switchToHttp().getRequest();

    if (err || !user) {
      req.user = null;
      return null;
    }

    // Gán user vào request
    req.user = user;

    // Gán user vào dynamic repo nếu có
    if (req.routeData?.context?.$repos) {
      for (const repo of Object.values(req.routeData?.context?.$repos) as any) {
        repo.currentUser = user;
      }
    }
    return user;
  }
}
