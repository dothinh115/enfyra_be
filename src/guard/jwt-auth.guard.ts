import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext) {
    const result = await super.canActivate(context); // dùng await để đảm bảo trả Promise<boolean>
    return result as boolean;
  }
  // Đè logic quăng lỗi mặc định của auth guard
  handleRequest(err: any, user: any, info: any, context: any, status?: any) {
    const req = context.switchToHttp().getRequest();

    // Nếu không có token hoặc token không hợp lệ, trả về null thay vì quăng lỗi
    if (err || !user) {
      req.user = null;
      return null;
    }
    //đưa payload vào req
    req.user = user;
    return user;
  }
}
