import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
const SKIP_PATHS = ['/api/auth/login', '/api/auth/csrf'];

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    if (SAFE.has(req.method)) return true;
    if (SKIP_PATHS.some((p) => req.path === p || req.originalUrl?.startsWith(p))) {
      return true;
    }
    const cookieToken = req.cookies?.csrf_token;
    const headerToken = req.headers['x-csrf-token'];
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      throw new ForbiddenException('Invalid CSRF token');
    }
    return true;
  }
}
